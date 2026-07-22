import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PurchaseOrder, POLineItem } from "@/lib/store";
import {
  expandPoColors,
  poOverallStage,
  type StoreShape as YarnStoreShape,
} from "@/lib/yarn-store";

// ============================================================================
// Types
// ============================================================================

export type PoProdStatus = "waiting" | "in_production" | "packed_ready";
export type PoProdItemStatus = "waiting" | "completed";

export interface PoProduction {
  poId: string;
  status: PoProdStatus;
  sentToProductionAt?: string | null;
  packedAt?: string | null;
}
export interface PoProductionItem {
  poItemId: string;
  poId: string;
  status: PoProdItemStatus;
  completedAt?: string | null;
}

export interface ProductionStoreShape {
  records: Record<string, PoProduction>;    // keyed by poId
  items: Record<string, PoProductionItem>;  // keyed by poItemId
}

const empty: ProductionStoreShape = { records: {}, items: {} };
let state: ProductionStoreShape = empty;
const listeners = new Set<() => void>();
function set(next: ProductionStoreShape) {
  state = next;
  listeners.forEach((l) => l());
}

// ============================================================================
// Hydration
// ============================================================================

let hydrated = false;
let hydrating: Promise<void> | null = null;

/* eslint-disable @typescript-eslint/no-explicit-any */

async function hydrate(): Promise<void> {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    const [r, i] = await Promise.all([
      supabase.from("po_production").select("*"),
      supabase.from("po_production_items").select("*"),
    ]);
    if (r.error) console.error("[production-store] records:", r.error);
    if (i.error) console.error("[production-store] items:", i.error);
    const records: Record<string, PoProduction> = {};
    for (const row of (r.data ?? []) as any[]) {
      records[row.po_id] = {
        poId: row.po_id,
        status: row.status,
        sentToProductionAt: row.sent_to_production_at ?? null,
        packedAt: row.packed_at ?? null,
      };
    }
    const items: Record<string, PoProductionItem> = {};
    for (const row of (i.data ?? []) as any[]) {
      items[row.po_item_id] = {
        poItemId: row.po_item_id,
        poId: row.po_id,
        status: row.status,
        completedAt: row.completed_at ?? null,
      };
    }
    set({ records, items });
    hydrated = true;
  })().finally(() => { hydrating = null; });
  return hydrating!;
}

async function refresh() {
  hydrated = false;
  await hydrate();
}

// ============================================================================
// Store API
// ============================================================================

export const productionStore = {
  getSnapshot: () => state,
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  hydrate,
  refresh,

  async sendToProduction(poId: string) {
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    const now = new Date().toISOString();
    const { error } = await supabase.from("po_production").upsert({
      po_id: poId,
      status: "in_production",
      sent_to_production_at: now,
      sent_by: uid,
      packed_at: null,
      updated_at: now,
    }, { onConflict: "po_id" });
    if (error) throw error;
    await refresh();
  },

  async markItemStatus(poItemId: string, poId: string, status: PoProdItemStatus) {
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    const now = new Date().toISOString();
    const { error } = await supabase.from("po_production_items").upsert({
      po_item_id: poItemId,
      po_id: poId,
      status,
      completed_at: status === "completed" ? now : null,
      completed_by: status === "completed" ? uid : null,
      updated_at: now,
    }, { onConflict: "po_item_id" });
    if (error) throw error;
    await refresh();
  },

  async markPacked(poId: string) {
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    const now = new Date().toISOString();
    const { error } = await supabase.from("po_production").upsert({
      po_id: poId,
      status: "packed_ready",
      packed_at: now,
      packed_by: uid,
      updated_at: now,
    }, { onConflict: "po_id" });
    if (error) throw error;
    await refresh();
  },

  async revertToProduction(poId: string) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("po_production").upsert({
      po_id: poId,
      status: "in_production",
      packed_at: null,
      updated_at: now,
    }, { onConflict: "po_id" });
    if (error) throw error;
    await refresh();
  },
};

export function useProductionStore<T>(sel: (s: ProductionStoreShape) => T): T {
  useEffect(() => { if (!hydrated) void hydrate(); }, []);
  return useSyncExternalStore(
    productionStore.subscribe,
    () => sel(productionStore.getSnapshot()),
    () => sel(empty),
  );
}

// ============================================================================
// Derivations
// ============================================================================

export type ProductionTab = "waiting" | "in_production" | "packed_ready";

export interface PoProgress {
  total: number;      // items excluding "Yarn Not Required" overrides
  completed: number;
  percent: number;    // 0..100
}

export function poProgress(
  po: PurchaseOrder,
  yarnState: YarnStoreShape,
  items: Record<string, PoProductionItem>,
): PoProgress {
  const relevant = po.items.filter(
    (it) => yarnState.overrides[it.id] !== "yarn_not_required",
  );
  const total = relevant.length;
  const completed = relevant.filter((it) => items[it.id]?.status === "completed").length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percent };
}

/** Which production tab a PO belongs to (or null if not eligible yet). */
export function poProductionTab(
  po: PurchaseOrder,
  yarnState: YarnStoreShape,
  records: Record<string, PoProduction>,
): ProductionTab | null {
  if (po.status === "completed") return null;
  const rec = records[po.id];
  if (rec?.status === "packed_ready") return "packed_ready";
  if (rec?.status === "in_production") return "in_production";
  // Waiting = any open PO not yet released to production (regardless of
  // procurement stage). Procurement decides when to release.
  return "waiting";
}

/** Ordered shade lookup for a PO item's colours. Uses the production yarn
 *  orders committed during procurement so Production sees the exact shade
 *  number(s) they must pull from stores. */
export interface ItemShadeInfo {
  colorName: string;
  kind: "base" | "line" | "single";
  supplierShadeNumber: string;
}
export function poItemShades(
  po: PurchaseOrder,
  item: POLineItem,
  yarnState: YarnStoreShape,
): ItemShadeInfo[] {
  const matKey = item.materialType.trim().toLowerCase();
  const colors = expandPoColors(item.color);
  return colors.map((c) => {
    const ck = c.name.trim().toLowerCase();
    let shade = "";
    outer: for (const o of yarnState.productionOrders) {
      for (const it of o.items) {
        if (
          it.poId === po.id &&
          it.material.trim().toLowerCase() === matKey &&
          it.colorName.trim().toLowerCase() === ck &&
          it.supplierShadeNumber
        ) {
          shade = it.supplierShadeNumber;
          break outer;
        }
      }
    }
    if (!shade) {
      // Fallback: look up an approved shade in the library (client/brand/color/material).
      const s = yarnState.shades.find(
        (x) =>
          x.clientId === po.clientId &&
          x.brandId === po.brandId &&
          x.colorName.trim().toLowerCase() === ck &&
          x.material.trim().toLowerCase() === matKey &&
          x.status === "approved",
      );
      if (s) shade = s.supplierShadeNumber;
    }
    return { colorName: c.name, kind: c.kind, supplierShadeNumber: shade };
  });
}

/** Aggregated raw-material summary for the entire PO. */
export interface RawMaterialLine {
  material: string;
  colorName: string;
  supplierShadeNumber: string;
  received: boolean;
}
export function poRawMaterialSummary(
  po: PurchaseOrder,
  yarnState: YarnStoreShape,
): RawMaterialLine[] {
  const map = new Map<string, RawMaterialLine>();
  for (const it of po.items) {
    if (yarnState.overrides[it.id] === "yarn_not_required") continue;
    const shades = poItemShades(po, it, yarnState);
    for (const s of shades) {
      const key = `${it.materialType}||${s.colorName}||${s.supplierShadeNumber}`;
      if (map.has(key)) continue;
      // Received if some production order item for this (po, material, color) is fully received.
      let ordered = 0, received = 0;
      const mk = it.materialType.trim().toLowerCase();
      const ck = s.colorName.trim().toLowerCase();
      for (const o of yarnState.productionOrders) {
        if (o.status === "cancelled") continue;
        for (const pi of o.items) {
          if (
            pi.poId === po.id &&
            pi.material.trim().toLowerCase() === mk &&
            pi.colorName.trim().toLowerCase() === ck
          ) {
            ordered += pi.orderedQty;
            received += pi.receivedQty;
          }
        }
      }
      map.set(key, {
        material: it.materialType,
        colorName: s.colorName,
        supplierShadeNumber: s.supplierShadeNumber,
        received: ordered > 0 && received + 0.0001 >= ordered,
      });
    }
  }
  return Array.from(map.values());
}

export const PROD_TAB_LABEL: Record<ProductionTab, string> = {
  waiting: "Waiting for Production",
  in_production: "In Production",
  packed_ready: "Packed & Ready for Dispatch",
};

export const PROD_STATUS_BADGE: Record<PoProdStatus, string> = {
  waiting: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  in_production: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  packed_ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

export function daysRemaining(deliveryDate: string): number {
  const dd = new Date(deliveryDate + "T00:00:00").getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((dd - today) / 86400000);
}