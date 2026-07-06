import { useSyncExternalStore } from "react";
import type { PurchaseOrder, POLineItem } from "@/lib/store";

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

export interface YarnReceiptAllocation {
  id: string;
  prodOrderItemId: string;
  qty: number;
}

export interface YarnReceipt {
  id: string;
  receiptDate: string;
  supplierId: string;
  supplierShadeNumber: string;
  lotNumber?: string;
  grossWeight: number;
  cones: number;
  unallocatedQty: number;
  remarks?: string;
  allocations: YarnReceiptAllocation[];
  createdAt: string;
}

export type PoItemOverride = "yarn_not_required";

export interface StoreShape {
  suppliers: YarnSupplier[];
  shades: YarnShade[];
  sampleOrders: SampleYarnOrder[];
  productionOrders: ProductionYarnOrder[];
  receipts: YarnReceipt[];
  overrides: Record<string, PoItemOverride>;
}

// ============================================================================
// Persistence
// ============================================================================

const LS_KEY = "shreelace.yarn.v1";

const empty: StoreShape = {
  suppliers: [],
  shades: [],
  sampleOrders: [],
  productionOrders: [],
  receipts: [],
  overrides: {},
};

function loadInitial(): StoreShape {
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

let state: StoreShape = loadInitial();
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function set(next: StoreShape) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
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
// Store API
// ============================================================================

function refreshProdOrderStatus(orderId: string) {
  const o = state.productionOrders.find((x) => x.id === orderId);
  if (!o) return;
  const total = o.items.reduce((s, i) => s + i.orderedQty, 0);
  const recv = o.items.reduce((s, i) => s + i.receivedQty, 0);
  let status: ProductionOrderStatus = o.status;
  if (o.status === "cancelled") return;
  if (recv <= 0.0001) status = "ordered";
  else if (recv + 0.0001 >= total) status = "received";
  else status = "partially_received";
  if (status !== o.status) {
    state = {
      ...state,
      productionOrders: state.productionOrders.map((x) => (x.id === orderId ? { ...x, status } : x)),
    };
  }
}

function applyReceipt(receipt: YarnReceipt) {
  const patchMap = new Map<string, number>();
  for (const a of receipt.allocations) {
    patchMap.set(a.prodOrderItemId, (patchMap.get(a.prodOrderItemId) ?? 0) + a.qty);
  }
  state = {
    ...state,
    receipts: [receipt, ...state.receipts],
    productionOrders: state.productionOrders.map((o) => ({
      ...o,
      items: o.items.map((i) =>
        patchMap.has(i.id) ? { ...i, receivedQty: (i.receivedQty || 0) + (patchMap.get(i.id) ?? 0) } : i,
      ),
    })),
  };
  for (const [itemId] of patchMap) {
    const order = state.productionOrders.find((o) => o.items.some((i) => i.id === itemId));
    if (order) refreshProdOrderStatus(order.id);
  }
  persist();
  listeners.forEach((l) => l());
}

export const yarnStore = {
  getSnapshot: () => state,
  subscribe,
  reset() { set(empty); },

  // ---------- Suppliers ----------
  addSupplier(s: Omit<YarnSupplier, "id" | "createdAt" | "active">): YarnSupplier {
    const ns: YarnSupplier = { ...s, id: uid(), active: true, createdAt: new Date().toISOString() };
    set({ ...state, suppliers: [...state.suppliers, ns] });
    return ns;
  },
  updateSupplier(id: string, patch: Partial<Omit<YarnSupplier, "id" | "createdAt">>) {
    set({ ...state, suppliers: state.suppliers.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  },
  deleteSupplier(id: string) {
    set({ ...state, suppliers: state.suppliers.filter((s) => s.id !== id) });
  },

  // ---------- Shades ----------
  addShade(s: Omit<YarnShade, "id" | "createdAt" | "status" | "approvalDate"> & { approvalDate?: string; status?: ShadeStatus }): YarnShade {
    const ns: YarnShade = {
      ...s,
      id: uid(),
      status: s.status ?? "approved",
      approvalDate: s.approvalDate ?? todayISO(),
      createdAt: new Date().toISOString(),
    };
    set({ ...state, shades: [...state.shades, ns] });
    return ns;
  },
  updateShade(id: string, patch: Partial<Omit<YarnShade, "id" | "createdAt">>) {
    set({ ...state, shades: state.shades.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  },
  deleteShade(id: string) {
    set({ ...state, shades: state.shades.filter((s) => s.id !== id) });
  },
  ensureShade(input: {
    clientId: string; brandId: string; colorName: string; material: string;
    supplierId: string; supplierShadeNumber: string;
  }): YarnShade {
    const found = state.shades.find((s) =>
      s.clientId === input.clientId &&
      s.brandId === input.brandId &&
      s.colorName.trim().toLowerCase() === input.colorName.trim().toLowerCase() &&
      s.material.trim().toLowerCase() === input.material.trim().toLowerCase() &&
      s.supplierId === input.supplierId &&
      s.supplierShadeNumber.trim().toLowerCase() === input.supplierShadeNumber.trim().toLowerCase(),
    );
    if (found) {
      if (found.status !== "approved") this.updateShade(found.id, { status: "approved" });
      return found;
    }
    return this.addShade({ ...input });
  },

  // ---------- Sample Yarn Orders ----------
  addSampleOrder(input: {
    supplierId: string; orderDate?: string; linkedPoId?: string | null; remarks?: string;
    items: Omit<SampleYarnOrderItem, "id" | "approvalStatus" | "approvedShadeId" | "approvedAt">[];
  }): SampleYarnOrder {
    const order: SampleYarnOrder = {
      id: uid(),
      number: nextNumberInternal("SYO", state.sampleOrders),
      orderDate: input.orderDate ?? todayISO(),
      supplierId: input.supplierId,
      linkedPoId: input.linkedPoId ?? null,
      remarks: input.remarks,
      status: "ordered",
      items: input.items.map((i) => ({
        ...i, id: uid(), approvalStatus: "pending" as const,
        approvedShadeId: null, approvedAt: null,
      })),
      receipts: [],
      createdAt: new Date().toISOString(),
    };
    set({ ...state, sampleOrders: [order, ...state.sampleOrders] });
    return order;
  },
  updateSampleOrder(id: string, patch: Partial<Omit<SampleYarnOrder, "id" | "createdAt" | "number">>) {
    set({ ...state, sampleOrders: state.sampleOrders.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  },
  deleteSampleOrder(id: string) {
    set({ ...state, sampleOrders: state.sampleOrders.filter((o) => o.id !== id) });
  },
  addSampleReceipt(orderId: string, r: Omit<SampleYarnReceipt, "id">) {
    const rec: SampleYarnReceipt = { ...r, id: uid() };
    set({
      ...state,
      sampleOrders: state.sampleOrders.map((o) =>
        o.id === orderId ? { ...o, receipts: [...o.receipts, rec], status: "received" } : o,
      ),
    });
  },
  approveSampleItem(orderId: string, itemId: string, supplierShadeNumber: string): YarnShade | null {
    const order = state.sampleOrders.find((o) => o.id === orderId);
    if (!order) return null;
    const item = order.items.find((i) => i.id === itemId);
    if (!item) return null;
    const shade = this.ensureShade({
      clientId: item.clientId, brandId: item.brandId,
      colorName: item.colorName, material: item.material,
      supplierId: order.supplierId, supplierShadeNumber,
    });
    set({
      ...state,
      sampleOrders: state.sampleOrders.map((o) =>
        o.id !== orderId ? o : {
          ...o,
          items: o.items.map((i) =>
            i.id === itemId
              ? { ...i, approvalStatus: "approved" as const, approvedShadeId: shade.id, approvedAt: new Date().toISOString() }
              : i,
          ),
        },
      ),
    });
    return shade;
  },
  redyeSampleItem(orderId: string, itemId: string) {
    set({
      ...state,
      sampleOrders: state.sampleOrders.map((o) =>
        o.id !== orderId ? o : {
          ...o,
          items: o.items.map((i) => (i.id === itemId ? { ...i, approvalStatus: "redye" as const } : i)),
        },
      ),
    });
  },

  // ---------- Production Yarn Orders ----------
  addProductionOrder(input: {
    supplierId: string; orderDate?: string; remarks?: string;
    items: Omit<ProductionYarnOrderItem, "id" | "receivedQty">[];
  }): ProductionYarnOrder {
    const order: ProductionYarnOrder = {
      id: uid(),
      number: nextNumberInternal("PYO", state.productionOrders),
      orderDate: input.orderDate ?? todayISO(),
      supplierId: input.supplierId,
      remarks: input.remarks,
      status: "ordered",
      items: input.items.map((i) => ({ ...i, id: uid(), receivedQty: 0 })),
      createdAt: new Date().toISOString(),
    };
    set({ ...state, productionOrders: [order, ...state.productionOrders] });
    return order;
  },
  updateProductionOrder(id: string, patch: Partial<Omit<ProductionYarnOrder, "id" | "createdAt" | "number">>) {
    set({ ...state, productionOrders: state.productionOrders.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  },
  deleteProductionOrder(id: string) {
    set({ ...state, productionOrders: state.productionOrders.filter((o) => o.id !== id) });
  },

  // ---------- Yarn Receipts ----------
  planYarnReceipt(input: {
    receiptDate: string; supplierId: string; supplierShadeNumber: string;
    lotNumber?: string; grossWeight: number; cones: number; remarks?: string;
  }):
    | { needsManual: true; pendingRows: PendingProdRow[]; draft: typeof input }
    | { needsManual: false; receipt: YarnReceipt }
  {
    const pending = getPendingRowsForShade(state, input.supplierId, input.supplierShadeNumber);
    const totalPending = pending.reduce((s, r) => s + r.pending, 0);
    if (input.grossWeight + 0.0001 >= totalPending && totalPending > 0) {
      const allocations: YarnReceiptAllocation[] = pending.map((r) => ({
        id: uid(), prodOrderItemId: r.prodOrderItemId, qty: r.pending,
      }));
      const receipt: YarnReceipt = {
        id: uid(),
        receiptDate: input.receiptDate,
        supplierId: input.supplierId,
        supplierShadeNumber: input.supplierShadeNumber,
        lotNumber: input.lotNumber,
        grossWeight: input.grossWeight,
        cones: input.cones,
        remarks: input.remarks,
        allocations,
        unallocatedQty: Math.max(0, input.grossWeight - totalPending),
        createdAt: new Date().toISOString(),
      };
      applyReceipt(receipt);
      return { needsManual: false, receipt };
    }
    if (totalPending <= 0) {
      // Nothing to allocate — save whole qty as unallocated.
      const receipt: YarnReceipt = {
        id: uid(),
        receiptDate: input.receiptDate,
        supplierId: input.supplierId,
        supplierShadeNumber: input.supplierShadeNumber,
        lotNumber: input.lotNumber,
        grossWeight: input.grossWeight,
        cones: input.cones,
        remarks: input.remarks,
        allocations: [],
        unallocatedQty: input.grossWeight,
        createdAt: new Date().toISOString(),
      };
      applyReceipt(receipt);
      return { needsManual: false, receipt };
    }
    return { needsManual: true, pendingRows: pending, draft: input };
  },
  commitYarnReceipt(input: {
    receiptDate: string; supplierId: string; supplierShadeNumber: string;
    lotNumber?: string; grossWeight: number; cones: number; remarks?: string;
    allocations: { prodOrderItemId: string; qty: number }[];
  }): YarnReceipt {
    const totalAlloc = input.allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0);
    const receipt: YarnReceipt = {
      id: uid(),
      receiptDate: input.receiptDate,
      supplierId: input.supplierId,
      supplierShadeNumber: input.supplierShadeNumber,
      lotNumber: input.lotNumber,
      grossWeight: input.grossWeight,
      cones: input.cones,
      remarks: input.remarks,
      allocations: input.allocations
        .filter((a) => (Number(a.qty) || 0) > 0)
        .map((a) => ({ id: uid(), prodOrderItemId: a.prodOrderItemId, qty: Number(a.qty) || 0 })),
      unallocatedQty: Math.max(0, input.grossWeight - totalAlloc),
      createdAt: new Date().toISOString(),
    };
    applyReceipt(receipt);
    return receipt;
  },
  deleteReceipt(id: string) {
    const rec = state.receipts.find((r) => r.id === id);
    if (!rec) return;
    const patchMap = new Map<string, number>();
    for (const a of rec.allocations) {
      patchMap.set(a.prodOrderItemId, (patchMap.get(a.prodOrderItemId) ?? 0) + a.qty);
    }
    set({
      ...state,
      receipts: state.receipts.filter((r) => r.id !== id),
      productionOrders: state.productionOrders.map((o) => ({
        ...o,
        items: o.items.map((i) =>
          patchMap.has(i.id) ? { ...i, receivedQty: Math.max(0, i.receivedQty - (patchMap.get(i.id) ?? 0)) } : i,
        ),
      })),
    });
    for (const o of state.productionOrders) refreshProdOrderStatus(o.id);
  },

  // ---------- Overrides ----------
  setOverride(poItemId: string, override: PoItemOverride | null) {
    const next = { ...state.overrides };
    if (override === null) delete next[poItemId];
    else next[poItemId] = override;
    set({ ...state, overrides: next });
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
  if (s.overrides[item.id] === "yarn_not_required") return "yarn_not_required";
  return calculateProcurementStage(s, po.id, item.materialType, item.color);
}

export function poOverallStage(s: StoreShape, po: PurchaseOrder): ProcurementStage {
  let best = 999;
  for (const it of po.items) {
    if (s.overrides[it.id] === "yarn_not_required") continue;
    const st = calculateProcurementStage(s, po.id, it.materialType, it.color);
    const idx = STAGE_PRIORITY.indexOf(st);
    if (idx >= 0 && idx < best) best = idx;
  }
  if (best === 999) return "yarn_not_required";
  return STAGE_PRIORITY[best];
}
