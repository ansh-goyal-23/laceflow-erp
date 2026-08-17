import type { Invoice, PurchaseOrder, SalesReturn } from "@/lib/store";

export type FulfillmentStatus = "Pending" | "Partially Dispatched" | "Completed";

/** Map: po_item_id -> total dispatched qty across all invoices */
export function dispatchedByPOItem(invoices: Invoice[], excludeInvoiceId?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const inv of invoices) {
    if (excludeInvoiceId && inv.id === excludeInvoiceId) continue;
    for (const it of inv.items) {
      if (!it.poItemId) continue;
      m.set(it.poItemId, (m.get(it.poItemId) ?? 0) + (Number(it.dispatchQty) || 0));
    }
  }
  return m;
}

/** Map: po_id -> total dispatched qty across all invoices (used for fallback when po_item_id missing) */
export function dispatchedByPO(invoices: Invoice[], excludeInvoiceId?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const inv of invoices) {
    if (excludeInvoiceId && inv.id === excludeInvoiceId) continue;
    for (const it of inv.items) {
      if (!it.poId) continue;
      m.set(it.poId, (m.get(it.poId) ?? 0) + (Number(it.dispatchQty) || 0));
    }
  }
  return m;
}

/** Map: po_item_id -> total returned qty across all sales returns */
export function returnedByPOItem(returns: SalesReturn[], excludeReturnId?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of returns) {
    if (excludeReturnId && r.id === excludeReturnId) continue;
    for (const it of r.items) {
      if (!it.poItemId) continue;
      m.set(it.poItemId, (m.get(it.poItemId) ?? 0) + (Number(it.returnQty) || 0));
    }
  }
  return m;
}

/** Map: po_id -> total returned qty (rows linked to a PO but not a specific PO item included too) */
export function returnedByPO(returns: SalesReturn[], excludeReturnId?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of returns) {
    if (excludeReturnId && r.id === excludeReturnId) continue;
    for (const it of r.items) {
      if (!it.poId) continue;
      m.set(it.poId, (m.get(it.poId) ?? 0) + (Number(it.returnQty) || 0));
    }
  }
  return m;
}

/** Dispatched net of client returns: po_item_id -> max(0, dispatched - returned) */
export function netDispatchedByPOItem(
  invoices: Invoice[],
  returns: SalesReturn[],
  excludeInvoiceId?: string,
): Map<string, number> {
  const disp = dispatchedByPOItem(invoices, excludeInvoiceId);
  const ret = returnedByPOItem(returns);
  const m = new Map(disp);
  for (const [k, v] of ret) {
    m.set(k, Math.max(0, (disp.get(k) ?? 0) - v));
  }
  return m;
}

/** Dispatched net of client returns at PO level */
export function netDispatchedByPO(
  invoices: Invoice[],
  returns: SalesReturn[],
  excludeInvoiceId?: string,
): Map<string, number> {
  const disp = dispatchedByPO(invoices, excludeInvoiceId);
  const ret = returnedByPO(returns);
  const m = new Map(disp);
  for (const [k, v] of ret) {
    m.set(k, Math.max(0, (disp.get(k) ?? 0) - v));
  }
  return m;
}

export function poFulfillmentStatus(
  po: PurchaseOrder,
  byItem: Map<string, number>,
  byPo: Map<string, number>,
): FulfillmentStatus {
  const ordered = po.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  let dispatched = 0;
  let allComplete = true;
  for (const it of po.items) {
    const d = byItem.get(it.id) ?? 0;
    dispatched += d;
    if (d + 0.0001 < (Number(it.quantity) || 0)) allComplete = false;
  }
  // include unmatched (po-level only) dispatches
  const extra = (byPo.get(po.id) ?? 0) - dispatched;
  if (extra > 0) {
    dispatched += extra;
    if (dispatched + 0.0001 >= ordered) allComplete = true;
  }
  if (dispatched <= 0.0001) return "Pending";
  if (allComplete && dispatched + 0.0001 >= ordered) return "Completed";
  return "Partially Dispatched";
}

export function statusBadgeClass(s: FulfillmentStatus): string {
  switch (s) {
    case "Completed": return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "Partially Dispatched": return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
    default: return "bg-muted text-muted-foreground";
  }
}