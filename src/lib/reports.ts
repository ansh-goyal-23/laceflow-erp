import type { Invoice, PurchaseOrder, SalesReturn } from "@/lib/store";
import { dispatchedByPOItem, returnedByPOItem } from "@/lib/dispatch";

export const PRODUCTION_STATUSES = [
  "Waiting for Yarn Order",
  "Waiting for Yarn Receipt",
  "Pending Production",
] as const;

export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export function daysRemaining(deliveryDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deliveryDate);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function daysRemainingLabel(n: number): string {
  if (n < 0) return `Overdue by ${Math.abs(n)} Day${Math.abs(n) === 1 ? "" : "s"}`;
  if (n === 0) return "Due Today";
  return `${n} Day${n === 1 ? "" : "s"} Remaining`;
}

export function urgencyClass(n: number): string {
  if (n < 0) return "bg-red-100 dark:bg-red-950/40";
  if (n <= 10) return "bg-amber-100 dark:bg-amber-950/40";
  return "";
}

export function urgencyGroup(n: number): 0 | 1 | 2 {
  if (n < 0) return 0;
  if (n <= 10) return 1;
  return 2;
}

export interface POPendency {
  po: PurchaseOrder;
  ordered: number;
  dispatched: number;
  returned: number;
  pending: number;
  daysLeft: number;
  /** Set for synthetic rows created from untraceable client returns */
  returnRef?: { returnId: string; returnNumber: string; itemId: string };
}

/** A synthetic PO used to surface untraceable client returns in PO-wise reports. */
function returnPseudoPO(r: SalesReturn, it: SalesReturn["items"][number]): PurchaseOrder {
  return {
    id: `ret:${it.id}`,
    poNumber: `RETURN ${r.returnNumber}`,
    poDate: r.returnDate,
    deliveryDate: r.dueDate || r.returnDate,
    brandId: "",
    clientId: r.clientId,
    status: "open",
    items: [],
  } as unknown as PurchaseOrder;
}

export function computePOPendencies(
  pos: PurchaseOrder[],
  invoices: Invoice[],
  returns: SalesReturn[] = [],
): POPendency[] {
  const byItem = dispatchedByPOItem(invoices);
  const retByItem = returnedByPOItem(returns);
  const rows: POPendency[] = pos
    .filter((p) => p.status === "open")
    .map((po) => {
      const ordered = po.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      let dispatched = 0;
      let returned = 0;
      let pending = 0;
      for (const it of po.items) {
        const ret = retByItem.get(it.id) ?? 0;
        const d = Math.max(0, (byItem.get(it.id) ?? 0) - ret);
        const q = Number(it.quantity) || 0;
        dispatched += d;
        returned += ret;
        pending += Math.max(0, q - d);
      }
      return {
        po,
        ordered,
        dispatched,
        returned,
        pending,
        daysLeft: daysRemaining(po.deliveryDate),
      };
    });

  // Untraceable returns (no PO link) become standalone client-level pendency rows
  for (const r of returns) {
    for (const it of r.items) {
      if (it.poId || it.settled) continue;
      const pending = Math.max(0, (Number(it.returnQty) || 0) - (Number(it.settledQty) || 0));
      if (pending <= 0) continue;
      const po = returnPseudoPO(r, it);
      rows.push({
        po,
        ordered: Number(it.returnQty) || 0,
        dispatched: 0,
        returned: Number(it.returnQty) || 0,
        pending,
        daysLeft: daysRemaining(po.deliveryDate),
        returnRef: { returnId: r.id, returnNumber: r.returnNumber, itemId: it.id },
      });
    }
  }
  return rows;
}

export interface ItemPendency {
  po: PurchaseOrder;
  itemId: string;
  articleCode: string;
  laceType: string;
  materialType: string;
  width: string;
  length: string;
  color: string;
  uom: string;
  ordered: number;
  dispatched: number;
  returned: number;
  pending: number;
  rate: number;
  daysLeft: number;
  returnRef?: { returnId: string; returnNumber: string; itemId: string };
}

export function computeItemPendencies(
  pos: PurchaseOrder[],
  invoices: Invoice[],
  returns: SalesReturn[] = [],
): ItemPendency[] {
  const byItem = dispatchedByPOItem(invoices);
  const retByItem = returnedByPOItem(returns);
  const out: ItemPendency[] = [];
  for (const po of pos) {
    if (po.status !== "open") continue;
    const daysLeft = daysRemaining(po.deliveryDate);
    for (const it of po.items) {
      const ordered = Number(it.quantity) || 0;
      const returned = retByItem.get(it.id) ?? 0;
      const dispatched = Math.max(0, (byItem.get(it.id) ?? 0) - returned);
      const pending = Math.max(0, ordered - dispatched);
      if (pending <= 0) continue;
      out.push({
        po,
        itemId: it.id,
        articleCode: it.articleCode,
        laceType: it.laceType,
        materialType: it.materialType,
        width: it.width,
        length: it.length,
        color: it.color,
        uom: it.uom,
        ordered,
        dispatched,
        returned,
        pending,
        rate: Number(it.rate) || 0,
        daysLeft,
      });
    }
  }

  // Untraceable returns become standalone client-level pendency rows
  for (const r of returns) {
    for (const it of r.items) {
      if (it.poId || it.settled) continue;
      const pending = Math.max(0, (Number(it.returnQty) || 0) - (Number(it.settledQty) || 0));
      if (pending <= 0) continue;
      const po = returnPseudoPO(r, it);
      out.push({
        po,
        itemId: it.id,
        articleCode: it.articleCode,
        laceType: it.laceType,
        materialType: it.materialType,
        width: it.width,
        length: it.length,
        color: it.color,
        uom: it.uom,
        ordered: Number(it.returnQty) || 0,
        dispatched: 0,
        returned: Number(it.returnQty) || 0,
        pending,
        rate: Number(it.rate) || 0,
        daysLeft: daysRemaining(po.deliveryDate),
        returnRef: { returnId: r.id, returnNumber: r.returnNumber, itemId: it.id },
      });
    }
  }
  return out;
}

export function poItemBreakdown(po: PurchaseOrder, invoices: Invoice[], returns: SalesReturn[] = []) {
  const byItem = dispatchedByPOItem(invoices);
  const retByItem = returnedByPOItem(returns);
  return po.items.map((it) => {
    const ordered = Number(it.quantity) || 0;
    const returned = retByItem.get(it.id) ?? 0;
    const dispatched = Math.max(0, (byItem.get(it.id) ?? 0) - returned);
    return {
      ...it,
      ordered,
      dispatched,
      returned,
      pending: Math.max(0, ordered - dispatched),
    };
  });
}