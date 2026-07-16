import { useEffect, useSyncExternalStore } from "react";
import type { PurchaseOrder, POLineItem } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Types
// ============================================================================

export interface YarnSupplier {
  id: string;
  name: string;
  contactPerson: string;
  mobile: string;
  email: string;
  address: string;
  gst: string;
  remarks: string;
  active: boolean;
  defaultPaperTubeWeight: number;
  createdAt: string;
}

export type ShadeStatus = "approved" | "inactive";

export interface YarnShade {
  id: string;
  clientId: string;
  brandId: string;
  colorName: string;
  material: string;
  supplierId: string;
  supplierShadeNumber: string;
  approvalDate: string;
  status: ShadeStatus;
  remarks?: string;
  createdAt: string;
}

export type SampleApprovalStatus = "pending" | "approved" | "redye";

export interface SampleYarnOrderItem {
  id: string;
  clientId: string;
  brandId: string;
  colorName: string;
  material: string;
  approxQty: number;
  swatchUrl?: string;
  pantone?: string;
  remarks?: string;
  approvalStatus: SampleApprovalStatus;
  approvedShadeId?: string | null;
  approvedAt?: string | null;
}

export interface SampleYarnReceipt {
  id: string;
  receiptDate: string;
  supplierShadeNumber: string;
  lotNumber?: string;
  grossWeight: number;
  cones: number;
  remarks?: string;
  /** Derived from a marker embedded in remarks when the receipt is mirrored
   *  from a Yarn Inward row; identifies the specific sample order item
   *  (color/material) that was physically received. */
  sampleOrderItemId?: string;
}

export type SampleOrderStatus = "draft" | "ordered" | "received" | "completed" | "cancelled";

export interface SampleYarnOrder {
  id: string;
  number: string;
  orderDate: string;
  supplierId: string;
  linkedPoId?: string | null;
  remarks?: string;
  status: SampleOrderStatus;
  items: SampleYarnOrderItem[];
  receipts: SampleYarnReceipt[];
  createdAt: string;
}

export function sampleExpectedDelivery(orderDate: string): string {
  const d = new Date(orderDate);
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export interface ProductionYarnOrderItem {
  id: string;
  poId: string;
  poItemId?: string | null;
  clientId: string;
  brandId: string;
  material: string;
  colorName: string;
  orderedQty: number;
  receivedQty: number;
  approvedShadeId?: string | null;
  supplierShadeNumber: string;
}

export type ProductionOrderStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";

export interface ProductionYarnOrder {
  id: string;
  number: string;
  orderDate: string;
  supplierId: string;
  remarks?: string;
  status: ProductionOrderStatus;
  items: ProductionYarnOrderItem[];
  createdAt: string;
}

export interface YarnInwardAllocation {
  id: string;
  inwardItemId: string;
  prodOrderItemId: string;
  qty: number;
}

export interface YarnInwardItem {
  id: string;
  inwardId: string;
  supplierShadeNumber: string;
  lotNumber?: string;
  grossWeight: number;
  cones: number;
  paperTubeWeight: number;
  netWeight: number;
  remarks?: string;
  allocations: YarnInwardAllocation[];
}

export interface YarnInward {
  id: string;
  number: string;
  inwardDate: string;
  supplierId: string;
  supplierChallanNumber: string;
  remarks?: string;
  items: YarnInwardItem[];
  createdAt: string;
}

export type PoItemOverride = "yarn_not_required";

export interface StoreShape {
  suppliers: YarnSupplier[];
  shades: YarnShade[];
  sampleOrders: SampleYarnOrder[];
  productionOrders: ProductionYarnOrder[];
  inwards: YarnInward[];
  overrides: Record<string, PoItemOverride>;
}

// ============================================================================
// Persistence (Supabase-backed with in-memory cache)
// ============================================================================

const empty: StoreShape = {
  suppliers: [],
  shades: [],
  sampleOrders: [],
  productionOrders: [],
  inwards: [],
  overrides: {},
};

let state: StoreShape = empty;
const listeners = new Set<() => void>();

function set(next: StoreShape) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nextNumberInternal(prefix: string, existing: { number: string }[]): string {
  const year = new Date().getFullYear();
  const pref = `${prefix}-${year}-`;
  let max = 0;
  for (const o of existing) {
    if (o.number.startsWith(pref)) {
      const n = parseInt(o.number.slice(pref.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return `${pref}${String(max + 1).padStart(4, "0")}`;
}

// ============================================================================
// Row → domain mappers (snake_case DB ↔ camelCase TS)
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapSupplier(r: any): YarnSupplier {
  return {
    id: r.id,
    name: r.name,
    contactPerson: r.contact_person ?? "",
    mobile: r.mobile ?? "",
    email: r.email ?? "",
    address: r.address ?? "",
    gst: r.gst ?? "",
    remarks: r.remarks ?? "",
    active: !!r.active,
    defaultPaperTubeWeight: Number(r.default_paper_tube_weight) || 0,
    createdAt: r.created_at,
  };
}

function mapShade(r: any): YarnShade {
  return {
    id: r.id,
    clientId: r.client_id,
    brandId: r.brand_id,
    colorName: r.color_name,
    material: r.material,
    supplierId: r.supplier_id,
    supplierShadeNumber: r.supplier_shade_number,
    approvalDate: r.approval_date,
    status: r.status,
    remarks: r.remarks ?? undefined,
    createdAt: r.created_at,
  };
}

function mapSampleItem(r: any): SampleYarnOrderItem {
  return {
    id: r.id,
    clientId: r.client_id,
    brandId: r.brand_id,
    colorName: r.color_name,
    material: r.material,
    approxQty: Number(r.approx_qty) || 0,
    swatchUrl: r.swatch_url ?? undefined,
    pantone: r.pantone ?? undefined,
    remarks: r.remarks ?? undefined,
    approvalStatus: r.approval_status,
    approvedShadeId: r.approved_shade_id ?? null,
    approvedAt: r.approved_at ?? null,
  };
}

function mapSampleReceipt(r: any): SampleYarnReceipt {
  return {
    id: r.id,
    receiptDate: r.receipt_date,
    supplierShadeNumber: r.supplier_shade_number ?? "",
    lotNumber: r.lot_number ?? undefined,
    grossWeight: Number(r.gross_weight) || 0,
    cones: Number(r.cones) || 0,
    remarks: r.remarks ?? undefined,
  };
}

function mapProdItem(r: any): ProductionYarnOrderItem {
  return {
    id: r.id,
    poId: r.po_id,
    poItemId: r.po_item_id ?? null,
    clientId: r.client_id,
    brandId: r.brand_id,
    material: r.material,
    colorName: r.color_name,
    orderedQty: Number(r.ordered_qty) || 0,
    receivedQty: Number(r.received_qty) || 0,
    approvedShadeId: r.approved_shade_id ?? null,
    supplierShadeNumber: r.supplier_shade_number ?? "",
  };
}

function mapAllocation(r: any): YarnInwardAllocation {
  return {
    id: r.id,
    inwardItemId: r.inward_item_id,
    prodOrderItemId: r.prod_order_item_id,
    qty: Number(r.qty) || 0,
  };
}

function mapInwardItem(r: any, allocs: YarnInwardAllocation[]): YarnInwardItem {
  return {
    id: r.id,
    inwardId: r.inward_id,
    supplierShadeNumber: r.supplier_shade_number,
    lotNumber: r.lot_number ?? undefined,
    grossWeight: Number(r.gross_weight) || 0,
    cones: Number(r.cones) || 0,
    paperTubeWeight: Number(r.paper_tube_weight) || 0,
    netWeight: Number(r.net_weight) || 0,
    remarks: r.remarks ?? undefined,
    allocations: allocs,
  };
}

function computeProdStatus(o: ProductionYarnOrder): ProductionOrderStatus {
  if (o.status === "cancelled") return "cancelled";
  const total = o.items.reduce((s, i) => s + i.orderedQty, 0);
  const recv = o.items.reduce((s, i) => s + i.receivedQty, 0);
  if (recv <= 0.0001) return "ordered";
  if (recv + 0.0001 >= total) return "received";
  return "partially_received";
}

// ============================================================================
// Hydration
// ============================================================================

let hydrated = false;
let hydrating: Promise<void> | null = null;

async function hydrate(): Promise<void> {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    const [sup, sh, so, soi, sr, po, poi, iw, iwi, ia, ov] = await Promise.all([
      supabase.from("yarn_suppliers").select("*").order("name"),
      supabase.from("yarn_shades").select("*").order("created_at", { ascending: false }),
      supabase.from("yarn_sample_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("yarn_sample_order_items").select("*"),
      supabase.from("yarn_sample_receipts").select("*"),
      supabase.from("yarn_production_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("yarn_production_order_items").select("*"),
      supabase.from("yarn_inwards").select("*").order("created_at", { ascending: false }),
      supabase.from("yarn_inward_items").select("*").order("sort_order"),
      supabase.from("yarn_inward_allocations").select("*"),
      supabase.from("yarn_po_item_overrides").select("*"),
    ]);

    const errs = [sup, sh, so, soi, sr, po, poi, iw, iwi, ia, ov]
      .map((r) => r.error).filter(Boolean);
    if (errs.length) {
      console.error("[yarn-store] hydrate errors:", errs);
    }

    const itemsByOrder = new Map<string, SampleYarnOrderItem[]>();
    for (const r of soi.data ?? []) {
      const it = mapSampleItem(r);
      const arr = itemsByOrder.get(r.order_id) ?? [];
      arr.push(it); itemsByOrder.set(r.order_id, arr);
    }
    const recByOrder = new Map<string, SampleYarnReceipt[]>();
    for (const r of sr.data ?? []) {
      const it = mapSampleReceipt(r);
      const arr = recByOrder.get(r.order_id) ?? [];
      arr.push(it); recByOrder.set(r.order_id, arr);
    }
    const sampleOrders: SampleYarnOrder[] = (so.data ?? []).map((r: any) => ({
      id: r.id,
      number: r.number,
      orderDate: r.order_date,
      supplierId: r.supplier_id,
      linkedPoId: r.linked_po_id ?? null,
      remarks: r.remarks ?? undefined,
      status: r.status,
      items: itemsByOrder.get(r.id) ?? [],
      receipts: recByOrder.get(r.id) ?? [],
      createdAt: r.created_at,
    }));

    const prodItemsByOrder = new Map<string, ProductionYarnOrderItem[]>();
    for (const r of poi.data ?? []) {
      const it = mapProdItem(r);
      const arr = prodItemsByOrder.get(r.order_id) ?? [];
      arr.push(it); prodItemsByOrder.set(r.order_id, arr);
    }
    const productionOrders: ProductionYarnOrder[] = (po.data ?? []).map((r: any) => {
      const items = prodItemsByOrder.get(r.id) ?? [];
      const base: ProductionYarnOrder = {
        id: r.id,
        number: r.number,
        orderDate: r.order_date,
        supplierId: r.supplier_id,
        remarks: r.remarks ?? undefined,
        status: r.status,
        items,
        createdAt: r.created_at,
      };
      return { ...base, status: computeProdStatus(base) };
    });

    const allocByItem = new Map<string, YarnInwardAllocation[]>();
    for (const r of ia.data ?? []) {
      const it = mapAllocation(r);
      const arr = allocByItem.get(r.inward_item_id) ?? [];
      arr.push(it); allocByItem.set(r.inward_item_id, arr);
    }
    const itemsByInward = new Map<string, YarnInwardItem[]>();
    for (const r of iwi.data ?? []) {
      const it = mapInwardItem(r, allocByItem.get(r.id) ?? []);
      const arr = itemsByInward.get(r.inward_id) ?? [];
      arr.push(it); itemsByInward.set(r.inward_id, arr);
    }
    const inwards: YarnInward[] = (iw.data ?? []).map((r: any) => ({
      id: r.id,
      number: r.number,
      inwardDate: r.inward_date,
      supplierId: r.supplier_id,
      supplierChallanNumber: r.supplier_challan_number ?? "",
      remarks: r.remarks ?? undefined,
      items: itemsByInward.get(r.id) ?? [],
      createdAt: r.created_at,
    }));

    const overrides: Record<string, PoItemOverride> = {};
    for (const r of ov.data ?? []) overrides[r.po_item_id] = r.override;

    set({
      suppliers: (sup.data ?? []).map(mapSupplier),
      shades: (sh.data ?? []).map(mapShade),
      sampleOrders,
      productionOrders,
      inwards,
      overrides,
    });
    hydrated = true;
  })().finally(() => { hydrating = null; });
  return hydrating!;
}

function throwIfError<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ============================================================================
// Store API
// ============================================================================

async function refresh() {
  hydrated = false;
  await hydrate();
}

async function persistProdReceivedQty(prodOrderItemId: string, delta: number) {
  const row = throwIfError(
    await supabase
      .from("yarn_production_order_items")
      .select("received_qty")
      .eq("id", prodOrderItemId)
      .single(),
  ) as { received_qty: number };
  const next = Math.max(0, Number(row.received_qty || 0) + delta);
  throwIfError(
    await supabase
      .from("yarn_production_order_items")
      .update({ received_qty: next })
      .eq("id", prodOrderItemId),
  );
}

export const yarnStore = {
  getSnapshot: () => state,
  subscribe,
  hydrate,
  refresh,

  // ---------- Suppliers ----------
  async addSupplier(s: Omit<YarnSupplier, "id" | "createdAt" | "active">): Promise<YarnSupplier> {
    const row = throwIfError(await supabase.from("yarn_suppliers").insert({
      name: s.name, contact_person: s.contactPerson, mobile: s.mobile,
      email: s.email, address: s.address, gst: s.gst, remarks: s.remarks,
      default_paper_tube_weight: s.defaultPaperTubeWeight ?? 0,
    }).select().single());
    await refresh();
    return mapSupplier(row);
  },
  async updateSupplier(id: string, patch: Partial<Omit<YarnSupplier, "id" | "createdAt">>) {
    const p: Record<string, unknown> = {};
    if (patch.name !== undefined) p.name = patch.name;
    if (patch.contactPerson !== undefined) p.contact_person = patch.contactPerson;
    if (patch.mobile !== undefined) p.mobile = patch.mobile;
    if (patch.email !== undefined) p.email = patch.email;
    if (patch.address !== undefined) p.address = patch.address;
    if (patch.gst !== undefined) p.gst = patch.gst;
    if (patch.remarks !== undefined) p.remarks = patch.remarks;
    if (patch.active !== undefined) p.active = patch.active;
    if (patch.defaultPaperTubeWeight !== undefined) p.default_paper_tube_weight = patch.defaultPaperTubeWeight;
    throwIfError(await supabase.from("yarn_suppliers").update(p).eq("id", id));
    await refresh();
  },
  async deleteSupplier(id: string) {
    throwIfError(await supabase.from("yarn_suppliers").delete().eq("id", id));
    await refresh();
  },

  // ---------- Shades ----------
  async addShade(s: Omit<YarnShade, "id" | "createdAt" | "status" | "approvalDate"> & { approvalDate?: string; status?: ShadeStatus }): Promise<YarnShade> {
    const row = throwIfError(await supabase.from("yarn_shades").insert({
      client_id: s.clientId, brand_id: s.brandId,
      color_name: s.colorName, material: s.material,
      supplier_id: s.supplierId, supplier_shade_number: s.supplierShadeNumber,
      approval_date: s.approvalDate ?? todayISO(),
      status: s.status ?? "approved",
      remarks: s.remarks,
    }).select().single());
    await refresh();
    return mapShade(row);
  },
  async updateShade(id: string, patch: Partial<Omit<YarnShade, "id" | "createdAt">>) {
    const p: Record<string, unknown> = {};
    if (patch.clientId !== undefined) p.client_id = patch.clientId;
    if (patch.brandId !== undefined) p.brand_id = patch.brandId;
    if (patch.colorName !== undefined) p.color_name = patch.colorName;
    if (patch.material !== undefined) p.material = patch.material;
    if (patch.supplierId !== undefined) p.supplier_id = patch.supplierId;
    if (patch.supplierShadeNumber !== undefined) p.supplier_shade_number = patch.supplierShadeNumber;
    if (patch.approvalDate !== undefined) p.approval_date = patch.approvalDate;
    if (patch.status !== undefined) p.status = patch.status;
    if (patch.remarks !== undefined) p.remarks = patch.remarks;
    throwIfError(await supabase.from("yarn_shades").update(p).eq("id", id));
    await refresh();
  },
  async deleteShade(id: string) {
    throwIfError(await supabase.from("yarn_shades").delete().eq("id", id));
    await refresh();
  },
  async ensureShade(input: {
    clientId: string; brandId: string; colorName: string; material: string;
    supplierId: string; supplierShadeNumber: string;
  }): Promise<YarnShade> {
    const found = state.shades.find((s) =>
      s.clientId === input.clientId &&
      s.brandId === input.brandId &&
      s.colorName.trim().toLowerCase() === input.colorName.trim().toLowerCase() &&
      s.material.trim().toLowerCase() === input.material.trim().toLowerCase() &&
      s.supplierId === input.supplierId &&
      s.supplierShadeNumber.trim().toLowerCase() === input.supplierShadeNumber.trim().toLowerCase(),
    );
    if (found) {
      if (found.status !== "approved") await this.updateShade(found.id, { status: "approved" });
      return found;
    }
    return this.addShade({ ...input });
  },

  // ---------- Sample Yarn Orders ----------
  async addSampleOrder(input: {
    supplierId: string; orderDate?: string; linkedPoId?: string | null; remarks?: string;
    items: Omit<SampleYarnOrderItem, "id" | "approvalStatus" | "approvedShadeId" | "approvedAt">[];
  }): Promise<SampleYarnOrder> {
    const number = nextNumberInternal("SYO", state.sampleOrders);
    const orderRow = throwIfError(await supabase.from("yarn_sample_orders").insert({
      number,
      order_date: input.orderDate ?? todayISO(),
      supplier_id: input.supplierId,
      linked_po_id: input.linkedPoId ?? null,
      remarks: input.remarks,
      status: "ordered",
    }).select().single()) as { id: string };
    if (input.items.length > 0) {
      throwIfError(await supabase.from("yarn_sample_order_items").insert(
        input.items.map((i, idx) => ({
          order_id: orderRow.id,
          client_id: i.clientId, brand_id: i.brandId,
          color_name: i.colorName, material: i.material,
          approx_qty: i.approxQty,
          swatch_url: i.swatchUrl, pantone: i.pantone, remarks: i.remarks,
          approval_status: "pending",
          sort_order: idx,
        })),
      ));
    }
    await refresh();
    return state.sampleOrders.find((o) => o.id === orderRow.id)!;
  },
  async updateSampleOrder(id: string, patch: Partial<Omit<SampleYarnOrder, "id" | "createdAt" | "number">>) {
    const p: Record<string, unknown> = {};
    if (patch.orderDate !== undefined) p.order_date = patch.orderDate;
    if (patch.supplierId !== undefined) p.supplier_id = patch.supplierId;
    if (patch.linkedPoId !== undefined) p.linked_po_id = patch.linkedPoId;
    if (patch.remarks !== undefined) p.remarks = patch.remarks;
    if (patch.status !== undefined) p.status = patch.status;
    if (Object.keys(p).length) {
      throwIfError(await supabase.from("yarn_sample_orders").update(p).eq("id", id));
    }
    await refresh();
  },
  async deleteSampleOrder(id: string) {
    throwIfError(await supabase.from("yarn_sample_orders").delete().eq("id", id));
    await refresh();
  },
  async addSampleReceipt(orderId: string, r: Omit<SampleYarnReceipt, "id">) {
    throwIfError(await supabase.from("yarn_sample_receipts").insert({
      order_id: orderId,
      receipt_date: r.receiptDate,
      supplier_shade_number: r.supplierShadeNumber,
      lot_number: r.lotNumber,
      gross_weight: r.grossWeight,
      cones: r.cones,
      remarks: r.remarks,
    }));
    throwIfError(await supabase.from("yarn_sample_orders").update({ status: "received" }).eq("id", orderId));
    await refresh();
  },
  async approveSampleItem(orderId: string, itemId: string, supplierShadeNumber: string): Promise<YarnShade | null> {
    const order = state.sampleOrders.find((o) => o.id === orderId);
    if (!order) return null;
    const item = order.items.find((i) => i.id === itemId);
    if (!item) return null;
    const shade = await this.ensureShade({
      clientId: item.clientId, brandId: item.brandId,
      colorName: item.colorName, material: item.material,
      supplierId: order.supplierId, supplierShadeNumber,
    });
    throwIfError(await supabase.from("yarn_sample_order_items").update({
      approval_status: "approved",
      approved_shade_id: shade.id,
      approved_at: new Date().toISOString(),
    }).eq("id", itemId));
    await refresh();
    return shade;
  },
  async redyeSampleItem(_orderId: string, itemId: string) {
    throwIfError(await supabase.from("yarn_sample_order_items")
      .update({ approval_status: "redye" }).eq("id", itemId));
    await refresh();
  },

  // ---------- Production Yarn Orders ----------
  async addProductionOrder(input: {
    supplierId: string; orderDate?: string; remarks?: string;
    items: Omit<ProductionYarnOrderItem, "id" | "receivedQty">[];
  }): Promise<ProductionYarnOrder> {
    const number = nextNumberInternal("PYO", state.productionOrders);
    const row = throwIfError(await supabase.from("yarn_production_orders").insert({
      number,
      order_date: input.orderDate ?? todayISO(),
      supplier_id: input.supplierId,
      remarks: input.remarks,
      status: "ordered",
    }).select().single()) as { id: string };
    if (input.items.length > 0) {
      throwIfError(await supabase.from("yarn_production_order_items").insert(
        input.items.map((i, idx) => ({
          order_id: row.id,
          po_id: i.poId,
          po_item_id: i.poItemId ?? null,
          client_id: i.clientId, brand_id: i.brandId,
          material: i.material, color_name: i.colorName,
          ordered_qty: i.orderedQty, received_qty: 0,
          approved_shade_id: i.approvedShadeId ?? null,
          supplier_shade_number: i.supplierShadeNumber,
          sort_order: idx,
        })),
      ));
    }
    await refresh();
    return state.productionOrders.find((o) => o.id === row.id)!;
  },
  async updateProductionOrder(id: string, patch: Partial<Omit<ProductionYarnOrder, "id" | "createdAt" | "number">>) {
    const p: Record<string, unknown> = {};
    if (patch.orderDate !== undefined) p.order_date = patch.orderDate;
    if (patch.supplierId !== undefined) p.supplier_id = patch.supplierId;
    if (patch.remarks !== undefined) p.remarks = patch.remarks;
    if (patch.status !== undefined) p.status = patch.status;
    if (Object.keys(p).length) {
      throwIfError(await supabase.from("yarn_production_orders").update(p).eq("id", id));
    }
    await refresh();
  },
  async deleteProductionOrder(id: string) {
    throwIfError(await supabase.from("yarn_production_orders").delete().eq("id", id));
    await refresh();
  },

  // ---------- Yarn Inwards (Store dept) ----------
  async addInward(input: {
    inwardDate: string; supplierId: string; supplierChallanNumber: string;
    remarks?: string;
    items: Array<{
      supplierShadeNumber: string; lotNumber?: string;
      grossWeight: number; cones: number; paperTubeWeight: number;
      remarks?: string;
      sampleOrderId?: string;
    }>;
  }): Promise<YarnInward> {
    if (!hydrated) await hydrate();
    if (!input.items.length) throw new Error("Add at least one inward item");
    const number = nextNumberInternal("INW", state.inwards);
    const header = throwIfError(await supabase.from("yarn_inwards").insert({
      number,
      inward_date: input.inwardDate,
      supplier_id: input.supplierId,
      supplier_challan_number: input.supplierChallanNumber ?? "",
      remarks: input.remarks,
    }).select().single()) as { id: string };
    throwIfError(await supabase.from("yarn_inward_items").insert(
      input.items.map((i, idx) => {
        const net = Math.max(0, (Number(i.grossWeight) || 0) - (Number(i.cones) || 0) * (Number(i.paperTubeWeight) || 0));
        return {
          inward_id: header.id,
          supplier_shade_number: i.supplierShadeNumber,
          lot_number: i.lotNumber || null,
          gross_weight: Number(i.grossWeight) || 0,
          cones: Number(i.cones) || 0,
          paper_tube_weight: Number(i.paperTubeWeight) || 0,
          net_weight: net,
          remarks: i.remarks || null,
          sort_order: idx,
        };
      }),
    ));
    // For rows tagged as sample, mirror as a sample receipt so the sample order
    // sees the physical arrival and the two records can be matched later.
    const sampleRows = input.items.filter((i) => i.sampleOrderId);
    if (sampleRows.length) {
      throwIfError(await supabase.from("yarn_sample_receipts").insert(
        sampleRows.map((i) => ({
          order_id: i.sampleOrderId,
          receipt_date: input.inwardDate,
          supplier_shade_number: i.supplierShadeNumber,
          lot_number: i.lotNumber || null,
          gross_weight: Number(i.grossWeight) || 0,
          cones: Number(i.cones) || 0,
          remarks: i.remarks || null,
        })),
      ));
      const orderIds = Array.from(new Set(sampleRows.map((i) => i.sampleOrderId!)));
      throwIfError(
        await supabase.from("yarn_sample_orders")
          .update({ status: "received" }).in("id", orderIds),
      );
    }
    await refresh();
    return state.inwards.find((r) => r.id === header.id)!;
  },

  async deleteInward(id: string) {
    const rec = state.inwards.find((r) => r.id === id);
    if (!rec) return;
    for (const it of rec.items) {
      for (const a of it.allocations) {
        await persistProdReceivedQty(a.prodOrderItemId, -a.qty);
      }
    }
    throwIfError(await supabase.from("yarn_inwards").delete().eq("id", id));
    await refresh();
  },

  /** Auto-allocate one inward item if remaining net covers all pending. */
  async allocateInwardItemAuto(inwardItemId: string): Promise<
    | { done: true }
    | { done: false; pendingRows: PendingProdRow[]; remainingNet: number }
  > {
    if (!hydrated) await hydrate();
    const { item, inward } = findInwardItem(state, inwardItemId);
    if (!item || !inward) throw new Error("Inward item not found");
    const remaining = inwardItemUnallocatedQty(item);
    if (remaining <= 0.0001) return { done: true };
    const pending = getPendingRowsForShade(state, inward.supplierId, item.supplierShadeNumber);
    const totalPending = pending.reduce((s, r) => s + r.pending, 0);
    if (totalPending <= 0.0001) return { done: true }; // nothing to allocate to; stays unallocated
    if (remaining + 0.0001 >= totalPending) {
      await commitInwardAllocations(inwardItemId,
        pending.map((r) => ({ prodOrderItemId: r.prodOrderItemId, qty: r.pending })));
      await refresh();
      return { done: true };
    }
    return { done: false, pendingRows: pending, remainingNet: remaining };
  },

  async allocateInwardItemManual(
    inwardItemId: string,
    allocations: { prodOrderItemId: string; qty: number }[],
  ): Promise<void> {
    if (!hydrated) await hydrate();
    const { item } = findInwardItem(state, inwardItemId);
    if (!item) throw new Error("Inward item not found");
    const remaining = inwardItemUnallocatedQty(item);
    const filtered = allocations.filter((a) => (Number(a.qty) || 0) > 0);
    const sum = filtered.reduce((s, a) => s + (Number(a.qty) || 0), 0);
    if (sum - remaining > 0.0001) {
      throw new Error(`Allocated ${sum.toFixed(2)} exceeds remaining net ${remaining.toFixed(2)}`);
    }
    await commitInwardAllocations(inwardItemId, filtered);
    await refresh();
  },

  // ---------- Overrides ----------
  async setOverride(poItemId: string, override: PoItemOverride | null) {
    if (override === null) {
      throwIfError(await supabase.from("yarn_po_item_overrides").delete().eq("po_item_id", poItemId));
    } else {
      throwIfError(await supabase.from("yarn_po_item_overrides").upsert({
        po_item_id: poItemId, override,
      }, { onConflict: "po_item_id" }));
    }
    await refresh();
  },
};

// ============================================================================
// Pending rows helper
// ============================================================================

export interface PendingProdRow {
  prodOrderItemId: string;
  orderId: string;
  orderNumber: string;
  poId: string;
  clientId: string;
  brandId: string;
  material: string;
  colorName: string;
  orderedQty: number;
  receivedQty: number;
  pending: number;
}

export function inwardItemAllocatedQty(it: YarnInwardItem): number {
  return it.allocations.reduce((s, a) => s + a.qty, 0);
}

export function inwardItemUnallocatedQty(it: YarnInwardItem): number {
  return Math.max(0, it.netWeight - inwardItemAllocatedQty(it));
}

function findInwardItem(s: StoreShape, id: string): { item?: YarnInwardItem; inward?: YarnInward } {
  for (const inw of s.inwards) {
    const it = inw.items.find((i) => i.id === id);
    if (it) return { item: it, inward: inw };
  }
  return {};
}

async function commitInwardAllocations(
  inwardItemId: string,
  allocations: { prodOrderItemId: string; qty: number }[],
): Promise<void> {
  const filtered = allocations.filter((a) => (Number(a.qty) || 0) > 0);
  if (!filtered.length) return;
  throwIfError(await supabase.from("yarn_inward_allocations").insert(
    filtered.map((a) => ({
      inward_item_id: inwardItemId,
      prod_order_item_id: a.prodOrderItemId,
      qty: Number(a.qty) || 0,
    })),
  ));
  for (const a of filtered) {
    await persistProdReceivedQty(a.prodOrderItemId, Number(a.qty) || 0);
  }
}

function getPendingRowsForShade(
  s: StoreShape, supplierId: string, supplierShadeNumber: string,
): PendingProdRow[] {
  const key = supplierShadeNumber.trim().toLowerCase();
  const out: PendingProdRow[] = [];
  for (const o of s.productionOrders) {
    if (o.supplierId !== supplierId) continue;
    if (o.status === "cancelled") continue;
    for (const it of o.items) {
      if ((it.supplierShadeNumber || "").trim().toLowerCase() !== key) continue;
      const pending = Math.max(0, it.orderedQty - it.receivedQty);
      if (pending <= 0) continue;
      out.push({
        prodOrderItemId: it.id, orderId: o.id, orderNumber: o.number,
        poId: it.poId, clientId: it.clientId, brandId: it.brandId,
        material: it.material, colorName: it.colorName,
        orderedQty: it.orderedQty, receivedQty: it.receivedQty, pending,
      });
    }
  }
  return out;
}

export function useYarnStore<T>(sel: (s: StoreShape) => T): T {
  useEffect(() => {
    if (!hydrated) void hydrate();
  }, []);
  return useSyncExternalStore(
    yarnStore.subscribe,
    () => sel(yarnStore.getSnapshot()),
    () => sel(empty),
  );
}

// ============================================================================
// Procurement stage
// ============================================================================

export const STAGE_PRIORITY = [
  "in_sampling",
  "waiting_for_yarn_order",
  "waiting_for_yarn_receipt",
  "production_pending",
] as const;
export type ProcurementStage = (typeof STAGE_PRIORITY)[number] | "yarn_not_required";

export const STAGE_LABEL: Record<ProcurementStage, string> = {
  in_sampling: "In Sampling",
  waiting_for_yarn_order: "Waiting for Yarn Order",
  waiting_for_yarn_receipt: "Waiting for Yarn Receipt",
  production_pending: "Production Pending",
  yarn_not_required: "Yarn Not Required",
};

export const STAGE_BADGE: Record<ProcurementStage, string> = {
  in_sampling: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  waiting_for_yarn_order: "bg-red-500/10 text-red-700 dark:text-red-300",
  waiting_for_yarn_receipt: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  production_pending: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  yarn_not_required: "bg-muted text-muted-foreground",
};

/** Source-of-truth stage calc for (poId, material, color). */
export function calculateProcurementStage(
  s: StoreShape, poId: string, material: string, color: string,
): Exclude<ProcurementStage, "yarn_not_required"> {
  const mk = material.trim().toLowerCase();
  const ck = color.trim().toLowerCase();

  const hasPendingSample = s.sampleOrders.some((o) =>
    o.linkedPoId === poId && o.status !== "cancelled" &&
    o.items.some((i) =>
      i.material.trim().toLowerCase() === mk &&
      i.colorName.trim().toLowerCase() === ck &&
      i.approvalStatus === "pending",
    ),
  );
  if (hasPendingSample) return "in_sampling";

  let ordered = 0;
  let received = 0;
  for (const o of s.productionOrders) {
    if (o.status === "cancelled") continue;
    for (const it of o.items) {
      if (
        it.poId === poId &&
        it.material.trim().toLowerCase() === mk &&
        it.colorName.trim().toLowerCase() === ck
      ) {
        ordered += it.orderedQty;
        received += it.receivedQty;
      }
    }
  }
  if (ordered <= 0.0001) return "waiting_for_yarn_order";
  if (received + 0.0001 < ordered) return "waiting_for_yarn_receipt";
  return "production_pending";
}

export function poItemStage(
  s: StoreShape, po: PurchaseOrder, item: POLineItem,
): ProcurementStage {
  // "Yarn Not Required" means procurement is complete for this item — treat as In Production.
  if (s.overrides[item.id] === "yarn_not_required") return "production_pending";
  // A single PO item may reference a base + line color (e.g. "LIMPET / LINE ORANGE").
  // Its overall stage is the least-advanced of its expanded colors.
  let best = 999;
  for (const c of expandPoColors(item.color)) {
    const st = calculateProcurementStage(s, po.id, item.materialType, c.name);
    const idx = STAGE_PRIORITY.indexOf(st);
    if (idx >= 0 && idx < best) best = idx;
  }
  return best === 999 ? "waiting_for_yarn_order" : STAGE_PRIORITY[best];
}

export function poOverallStage(s: StoreShape, po: PurchaseOrder): ProcurementStage {
  let best = 999;
  for (const it of po.items) {
    if (s.overrides[it.id] === "yarn_not_required") continue;
    for (const c of expandPoColors(it.color)) {
      const st = calculateProcurementStage(s, po.id, it.materialType, c.name);
      const idx = STAGE_PRIORITY.indexOf(st);
      if (idx >= 0 && idx < best) best = idx;
    }
  }
  if (best === 999) return "yarn_not_required";
  return STAGE_PRIORITY[best];
}

/**
 * Parse a raw PO color string into independent procurement colors.
 * Customer POs often write compound colors like:
 *   "LIMPET SHELL / LINE VIBRANT ORANGE"
 *   "WHITE / LINE BLACK"
 * which really describe two yarns (base + line trim) that must be procured
 * separately. Detection is on the "/LINE" or "/ LINE" separator (case-insensitive).
 * Colors without that marker are returned as a single entry.
 */
export function expandPoColors(raw: string): Array<{ name: string; kind: "base" | "line" | "single" }> {
  const s = (raw ?? "").trim();
  if (!s) return [];
  const m = s.match(/^(.*?)\s*\/\s*LINE\s+(.+)$/i);
  if (!m) return [{ name: s, kind: "single" }];
  const base = m[1].trim();
  const line = m[2].trim();
  const out: Array<{ name: string; kind: "base" | "line" | "single" }> = [];
  if (base) out.push({ name: base, kind: "base" });
  if (line) out.push({ name: line, kind: "line" });
  return out.length ? out : [{ name: s, kind: "single" }];
}

// ============================================================================
// Inward item context (production vs sample + linked order + inferred color)
// ============================================================================

export interface InwardItemContext {
  type: "production" | "sample" | "unknown";
  colorName?: string;
  material?: string;
  linkedOrderId?: string;
  linkedOrderNumber?: string;
  linkedOrderKind?: "production" | "sample";
  sampleReceiptId?: string;
}

function matchSampleReceipt(
  s: StoreShape, inward: YarnInward, item: YarnInwardItem,
): { order?: SampleYarnOrder; receipt?: SampleYarnReceipt } {
  const shade = (item.supplierShadeNumber || "").trim().toLowerCase();
  const lot = (item.lotNumber || "").trim().toLowerCase();
  for (const o of s.sampleOrders) {
    if (o.supplierId !== inward.supplierId) continue;
    const r = o.receipts.find((r) =>
      r.receiptDate === inward.inwardDate &&
      (r.supplierShadeNumber || "").trim().toLowerCase() === shade &&
      (r.lotNumber || "").trim().toLowerCase() === lot &&
      Math.abs(r.grossWeight - item.grossWeight) < 0.01 &&
      Math.abs(r.cones - item.cones) < 0.5,
    );
    if (r) return { order: o, receipt: r };
  }
  return {};
}

/** Best-effort classification: allocation → production; matching sample receipt → sample. */
export function inwardItemContext(
  s: StoreShape, inward: YarnInward, item: YarnInwardItem,
): InwardItemContext {
  if (item.allocations.length > 0) {
    for (const o of s.productionOrders) {
      for (const it of o.items) {
        if (item.allocations.some((a) => a.prodOrderItemId === it.id)) {
          return {
            type: "production",
            colorName: it.colorName, material: it.material,
            linkedOrderId: o.id, linkedOrderNumber: o.number,
            linkedOrderKind: "production",
          };
        }
      }
    }
  }
  const { order: sOrder, receipt: sRec } = matchSampleReceipt(s, inward, item);
  if (sOrder && sRec) {
    const colors = Array.from(new Set(sOrder.items.map((i) => i.colorName)));
    const mats = Array.from(new Set(sOrder.items.map((i) => i.material)));
    return {
      type: "sample",
      colorName: colors.length === 1 ? colors[0] : colors.join(", "),
      material: mats.length === 1 ? mats[0] : undefined,
      linkedOrderId: sOrder.id, linkedOrderNumber: sOrder.number,
      linkedOrderKind: "sample",
      sampleReceiptId: sRec.id,
    };
  }
  const key = (item.supplierShadeNumber || "").trim().toLowerCase();
  for (const o of s.productionOrders) {
    if (o.supplierId !== inward.supplierId) continue;
    for (const it of o.items) {
      if ((it.supplierShadeNumber || "").trim().toLowerCase() === key) {
        return {
          type: "production",
          colorName: it.colorName, material: it.material,
          linkedOrderId: o.id, linkedOrderNumber: o.number,
          linkedOrderKind: "production",
        };
      }
    }
  }
  return { type: "unknown" };
}

/** Guess which sample order item a receipt refers to (by supplier shade # of an approved shade,
 *  else by only-item fallback). Returns undefined when the order has multiple items and no unique match. */
export function sampleReceiptItemColor(
  s: StoreShape, order: SampleYarnOrder, receipt: SampleYarnReceipt,
): { colorName?: string; material?: string } {
  const shadeKey = (receipt.supplierShadeNumber || "").trim().toLowerCase();
  if (shadeKey) {
    for (const it of order.items) {
      if (!it.approvedShadeId) continue;
      const sh = s.shades.find((x) => x.id === it.approvedShadeId);
      if (sh && sh.supplierShadeNumber.trim().toLowerCase() === shadeKey) {
        return { colorName: it.colorName, material: it.material };
      }
    }
  }
  if (order.items.length === 1) {
    return { colorName: order.items[0].colorName, material: order.items[0].material };
  }
  return {
    colorName: order.items.map((i) => i.colorName).join(", "),
    material: undefined,
  };
}
