import type { Invoice, PurchaseOrder } from "@/lib/store";
import { dispatchedByPO, dispatchedByPOItem } from "@/lib/dispatch";

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
  pending: number;
  daysLeft: number;
}

export function computePOPendencies(pos: PurchaseOrder[], invoices: Invoice[]): POPendency[] {
  const byItem = dispatchedByPOItem(invoices);
  const byPo = dispatchedByPO(invoices);
  return pos
    .filter((p) => p.status === "open")
    .map((po) => {
      const ordered = po.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      let dispatched = 0;
      for (const it of po.items) dispatched += byItem.get(it.id) ?? 0;
      const extra = (byPo.get(po.id) ?? 0) - dispatched;
      if (extra > 0) dispatched += extra;
      return {
        po,
        ordered,
        dispatched,
        pending: Math.max(0, ordered - dispatched),
        daysLeft: daysRemaining(po.deliveryDate),
      };
    });
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
  pending: number;
  rate: number;
  daysLeft: number;
}

export function computeItemPendencies(pos: PurchaseOrder[], invoices: Invoice[]): ItemPendency[] {
  const byItem = dispatchedByPOItem(invoices);
  const out: ItemPendency[] = [];
  for (const po of pos) {
    if (po.status !== "open") continue;
    const daysLeft = daysRemaining(po.deliveryDate);
    for (const it of po.items) {
      const ordered = Number(it.quantity) || 0;
      const dispatched = byItem.get(it.id) ?? 0;
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
        pending,
        rate: Number(it.rate) || 0,
        daysLeft,
      });
    }
  }
  return out;
}

export function poItemBreakdown(po: PurchaseOrder, invoices: Invoice[]) {
  const byItem = dispatchedByPOItem(invoices);
  return po.items.map((it) => {
    const ordered = Number(it.quantity) || 0;
    const dispatched = byItem.get(it.id) ?? 0;
    return {
      ...it,
      ordered,
      dispatched,
      pending: Math.max(0, ordered - dispatched),
    };
  });
}