import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/audit";
import { netDispatchedByPOItem, netDispatchedByPO, poFulfillmentStatus } from "@/lib/dispatch";

export interface Brand {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string | null;
}

export interface Client {
  id: string;
  name: string;
  address: string;
  gstNumber: string;
  phone: string;
  email: string;
  createdAt: string;
  createdBy: string | null;
}

export interface POLineItem {
  id: string;
  articleCode: string;
  laceType: string;
  materialType: string;
  
  width: string;
  length: string;
  color: string;
  uom: string;
  quantity: number;
  rate: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  brandId: string;
  clientId: string;
  poDate: string;
  deliveryDate: string;
  items: POLineItem[];
  status: "draft" | "open" | "completed";
  productionStatus?: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  poId: string | null;
  poItemId: string | null;
  poNumber: string;
  articleCode: string;
  laceType: string;
  materialType: string;
  width: string;
  length: string;
  color: string;
  uom: string;
  dispatchQty: number;
  rate: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  dispatchDate: string;
  clientId: string;
  createdAt: string;
  createdBy: string | null;
  items: InvoiceItem[];
}

export type SalesReturnDocType = "debit_note" | "return_challan";

export interface SalesReturnItem {
  id: string;
  returnId: string;
  invoiceId: string | null;
  invoiceItemId: string | null;
  invoiceNumber: string;
  poId: string | null;
  poItemId: string | null;
  poNumber: string;
  articleCode: string;
  laceType: string;
  materialType: string;
  width: string;
  length: string;
  color: string;
  uom: string;
  returnQty: number;
  rate: number;
  reason: string;
  settled: boolean;
  settledQty: number;
}

export interface SalesReturn {
  id: string;
  returnNumber: string;
  returnDate: string;
  clientId: string;
  docType: SalesReturnDocType;
  referenceNumber: string;
  dueDate: string;
  remarks: string;
  createdAt: string;
  createdBy: string | null;
  items: SalesReturnItem[];
}

type StoreShape = {
  brands: Brand[];
  clients: Client[];
  purchaseOrders: PurchaseOrder[];
  invoices: Invoice[];
  salesReturns: SalesReturn[];
};

const empty: StoreShape = { brands: [], clients: [], purchaseOrders: [], invoices: [], salesReturns: [] };
let state: StoreShape = empty;
const listeners = new Set<() => void>();

function set(next: StoreShape) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- mappers ----------

type BrandRow = { id: string; name: string; created_at: string; created_by: string | null };
type ClientRow = {
  id: string;
  name: string;
  address: string | null;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  created_by: string | null;
};
type POItemRow = {
  id: string;
  article_code: string | null;
  lace_type: string | null;
  material_type: string | null;
  
  width: string | null;
  length: string | null;
  color: string | null;
  uom: string;
  quantity: number;
  rate: number;
};
type PORow = {
  id: string;
  po_number: string;
  brand_id: string;
  client_id: string;
  po_date: string;
  delivery_date: string;
  status: "draft" | "open" | "completed";
  production_status: string | null;
  created_at: string;
  created_by: string | null;
  purchase_order_items: POItemRow[];
};

const toBrand = (r: BrandRow): Brand => ({ id: r.id, name: r.name, createdAt: r.created_at, createdBy: r.created_by ?? null });
const toClient = (r: ClientRow): Client => ({
  id: r.id,
  name: r.name,
  address: r.address ?? "",
  gstNumber: r.gstin ?? "",
  phone: r.phone ?? "",
  email: r.email ?? "",
  createdAt: r.created_at,
  createdBy: r.created_by ?? null,
});
const toItem = (r: POItemRow): POLineItem => ({
  id: r.id,
  articleCode: r.article_code ?? "",
  laceType: r.lace_type ?? "",
  materialType: r.material_type ?? "",
  width: r.width ?? "",
  length: r.length ?? "",
  color: r.color ?? "",
  uom: r.uom,
  quantity: Number(r.quantity),
  rate: Number(r.rate),
});
const toPO = (r: PORow): PurchaseOrder => ({
  id: r.id,
  poNumber: r.po_number,
  brandId: r.brand_id,
  clientId: r.client_id,
  poDate: r.po_date,
  deliveryDate: r.delivery_date,
  status: r.status,
  productionStatus: r.production_status ?? null,
  createdAt: r.created_at,
  createdBy: r.created_by ?? null,
  items: (r.purchase_order_items ?? []).map(toItem),
});

type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  po_id: string | null;
  po_item_id: string | null;
  po_number: string | null;
  article_code: string | null;
  lace_type: string | null;
  material_type: string | null;
  width: string | null;
  length: string | null;
  color: string | null;
  uom: string;
  dispatch_qty: number;
  rate: number;
};
type InvoiceRow = {
  id: string;
  invoice_number: string;
  dispatch_date: string;
  client_id: string;
  created_at: string;
  created_by: string | null;
  invoice_items: InvoiceItemRow[];
};
const toInvoiceItem = (r: InvoiceItemRow): InvoiceItem => ({
  id: r.id,
  invoiceId: r.invoice_id,
  poId: r.po_id,
  poItemId: r.po_item_id,
  poNumber: r.po_number ?? "",
  articleCode: r.article_code ?? "",
  laceType: r.lace_type ?? "",
  materialType: r.material_type ?? "",
  width: r.width ?? "",
  length: r.length ?? "",
  color: r.color ?? "",
  uom: r.uom,
  dispatchQty: Number(r.dispatch_qty),
  rate: Number(r.rate),
});
const toInvoice = (r: InvoiceRow): Invoice => ({
  id: r.id,
  invoiceNumber: r.invoice_number,
  dispatchDate: r.dispatch_date,
  clientId: r.client_id,
  createdAt: r.created_at,
  createdBy: r.created_by ?? null,
  items: (r.invoice_items ?? []).map(toInvoiceItem),
});

type SalesReturnItemRow = {
  id: string;
  return_id: string;
  invoice_id: string | null;
  invoice_item_id: string | null;
  invoice_number: string | null;
  po_id: string | null;
  po_item_id: string | null;
  po_number: string | null;
  article_code: string | null;
  lace_type: string | null;
  material_type: string | null;
  width: string | null;
  length: string | null;
  color: string | null;
  uom: string;
  return_qty: number | string;
  rate: number | string;
  reason: string | null;
  settled: boolean;
  settled_qty: number | string;
  sort_order?: number;
};
type SalesReturnRow = {
  id: string;
  return_number: string;
  return_date: string;
  client_id: string;
  doc_type: string;
  reference_number: string | null;
  due_date: string | null;
  remarks: string | null;
  created_at: string;
  created_by: string | null;
  sales_return_items: SalesReturnItemRow[];
};
const toSalesReturnItem = (r: SalesReturnItemRow): SalesReturnItem => ({
  id: r.id,
  returnId: r.return_id,
  invoiceId: r.invoice_id,
  invoiceItemId: r.invoice_item_id,
  invoiceNumber: r.invoice_number ?? "",
  poId: r.po_id,
  poItemId: r.po_item_id,
  poNumber: r.po_number ?? "",
  articleCode: r.article_code ?? "",
  laceType: r.lace_type ?? "",
  materialType: r.material_type ?? "",
  width: r.width ?? "",
  length: r.length ?? "",
  color: r.color ?? "",
  uom: r.uom,
  returnQty: Number(r.return_qty) || 0,
  rate: Number(r.rate) || 0,
  reason: r.reason ?? "",
  settled: !!r.settled,
  settledQty: Number(r.settled_qty) || 0,
});
const toSalesReturn = (r: SalesReturnRow): SalesReturn => ({
  id: r.id,
  returnNumber: r.return_number,
  returnDate: r.return_date,
  clientId: r.client_id,
  docType: (r.doc_type === "return_challan" ? "return_challan" : "debit_note"),
  referenceNumber: r.reference_number ?? "",
  dueDate: r.due_date ?? "",
  remarks: r.remarks ?? "",
  createdAt: r.created_at,
  createdBy: r.created_by ?? null,
  items: [...(r.sales_return_items ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(toSalesReturnItem),
});

// ---------- store ----------

export const store = {
  getSnapshot: () => state,
  subscribe,
  reset() {
    set(empty);
  },
  async hydrate() {
    const [b, c, p, inv, sr] = await Promise.all([
      supabase.from("brands").select("*").order("created_at"),
      supabase.from("clients").select("*").order("created_at"),
      supabase
        .from("purchase_orders")
        .select("*, purchase_order_items(*)")
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select("*, invoice_items(*)")
        .order("created_at", { ascending: false }),
      supabase
        .from("sales_returns")
        .select("*, sales_return_items(*)")
        .order("created_at", { ascending: false }),
    ]);
    if (b.error) throw b.error;
    if (c.error) throw c.error;
    if (p.error) throw p.error;
    if (inv.error) throw inv.error;
    // Sales returns table may not exist yet (migration not run) — degrade gracefully.
    if (sr.error) console.warn("Sales returns unavailable:", sr.error.message);
    set({
      brands: (b.data as BrandRow[]).map(toBrand),
      clients: (c.data as ClientRow[]).map(toClient),
      purchaseOrders: (p.data as PORow[]).map(toPO),
      invoices: (inv.data as InvoiceRow[]).map(toInvoice),
      salesReturns: sr.error ? [] : ((sr.data ?? []) as unknown as SalesReturnRow[]).map(toSalesReturn),
    });
  },

  // ---- Brands ----
  async addBrand(name: string): Promise<Brand> {
    const { data, error } = await supabase
      .from("brands")
      .insert({ name: name.trim() })
      .select()
      .single();
    if (error) throw error;
    const b = toBrand(data as BrandRow);
    set({ ...state, brands: [...state.brands, b] });
    void logActivity("Brands", "CREATE", "Brand", b.name);
    return b;
  },
  async updateBrand(id: string, name: string) {
    const { error } = await supabase.from("brands").update({ name: name.trim() }).eq("id", id);
    if (error) throw error;
    set({ ...state, brands: state.brands.map((b) => (b.id === id ? { ...b, name: name.trim() } : b)) });
    void logActivity("Brands", "EDIT", "Brand", name.trim());
  },
  async deleteBrand(id: string) {
    const existing = state.brands.find((b) => b.id === id);
    const { error } = await supabase.from("brands").delete().eq("id", id);
    if (error) throw error;
    set({ ...state, brands: state.brands.filter((b) => b.id !== id) });
    void logActivity("Brands", "DELETE", "Brand", existing?.name ?? id);
  },

  // ---- Clients ----
  async addClient(c: Omit<Client, "id" | "createdAt" | "createdBy">): Promise<Client> {
    const { data, error } = await supabase
      .from("clients")
      .insert({
        name: c.name,
        address: c.address,
        gstin: c.gstNumber,
        phone: c.phone,
        email: c.email,
      })
      .select()
      .single();
    if (error) throw error;
    const nc = toClient(data as ClientRow);
    set({ ...state, clients: [...state.clients, nc] });
    void logActivity("Clients", "CREATE", "Client", nc.name);
    return nc;
  },
  async updateClient(id: string, c: Omit<Client, "id" | "createdAt" | "createdBy">) {
    const { error } = await supabase
      .from("clients")
      .update({
        name: c.name,
        address: c.address,
        gstin: c.gstNumber,
        phone: c.phone,
        email: c.email,
      })
      .eq("id", id);
    if (error) throw error;
    set({ ...state, clients: state.clients.map((x) => (x.id === id ? { ...x, ...c } : x)) });
    void logActivity("Clients", "EDIT", "Client", c.name);
  },
  async deleteClient(id: string) {
    const existing = state.clients.find((c) => c.id === id);
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) throw error;
    set({ ...state, clients: state.clients.filter((c) => c.id !== id) });
    void logActivity("Clients", "DELETE", "Client", existing?.name ?? id);
  },

  // ---- POs ----
  async addPO(po: Omit<PurchaseOrder, "id" | "createdAt" | "createdBy">): Promise<PurchaseOrder> {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await supabase
      .from("purchase_orders")
      .insert({
        po_number: po.poNumber,
        brand_id: po.brandId,
        client_id: po.clientId,
        po_date: po.poDate,
        delivery_date: po.deliveryDate,
        status: po.status,
        created_by: uid,
      })
      .select()
      .single();
    if (error) throw error;
    const poId = (data as PORow).id;
    await insertItems(poId, po.items);
    await refreshPO(poId);
    void logActivity("Purchase Orders", "CREATE", "PO", po.poNumber);
    return state.purchaseOrders.find((p) => p.id === poId)!;
  },
  async updatePO(id: string, po: Omit<PurchaseOrder, "id" | "createdAt" | "createdBy">) {
    const { error } = await supabase
      .from("purchase_orders")
      .update({
        po_number: po.poNumber,
        brand_id: po.brandId,
        client_id: po.clientId,
        po_date: po.poDate,
        delivery_date: po.deliveryDate,
        status: po.status,
      })
      .eq("id", id);
    if (error) throw error;
    // Diff items: preserve existing row IDs so invoice_items.po_item_id links stay intact.
    await diffUpsertItems(id, po.items);
    await refreshPO(id);
    void logActivity("Purchase Orders", "EDIT", "PO", po.poNumber);
  },
  async deletePO(id: string) {
    const existing = state.purchaseOrders.find((p) => p.id === id);
    if (existing) {
      const blocking = state.invoices.filter((inv) =>
        inv.items.some(
          (it) => it.poId === id || (it.poNumber && it.poNumber === existing.poNumber),
        ),
      );
      if (blocking.length > 0) {
        const nums = Array.from(new Set(blocking.map((b) => b.invoiceNumber))).slice(0, 5).join(", ");
        throw new Error(
          `Cannot delete PO ${existing.poNumber}: it is used in invoice(s) ${nums}${blocking.length > 5 ? "…" : ""}. Delete those invoices first.`,
        );
      }
    }
    const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
    if (error) throw error;
    set({ ...state, purchaseOrders: state.purchaseOrders.filter((p) => p.id !== id) });
    void logActivity("Purchase Orders", "DELETE", "PO", existing?.poNumber ?? id);
  },

  async updatePOStatus(id: string, status: "draft" | "open" | "completed") {
    const { error } = await supabase
      .from("purchase_orders")
      .update({ status })
      .eq("id", id);
    if (error) throw error;
    set({
      ...state,
      purchaseOrders: state.purchaseOrders.map((p) => (p.id === id ? { ...p, status } : p)),
    });
    const po = state.purchaseOrders.find((p) => p.id === id);
    void logActivity("Purchase Orders", "EDIT", "PO Status", `${po?.poNumber ?? id} → ${status}`);
  },

  async updateProductionStatus(id: string, productionStatus: string | null) {
    const { error } = await supabase
      .from("purchase_orders")
      .update({ production_status: productionStatus })
      .eq("id", id);
    if (error) throw error;
    set({
      ...state,
      purchaseOrders: state.purchaseOrders.map((p) => (p.id === id ? { ...p, productionStatus } : p)),
    });
    const po = state.purchaseOrders.find((p) => p.id === id);
    void logActivity("Purchase Orders", "EDIT", "Production Status", `${po?.poNumber ?? id} → ${productionStatus ?? "—"}`);
  },

  // ---- Invoices ----
  async addInvoice(inv: Omit<Invoice, "id" | "createdAt" | "createdBy" | "items"> & { items: Omit<InvoiceItem, "id" | "invoiceId">[] }): Promise<Invoice> {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await supabase
      .from("invoices")
      .insert({
        invoice_number: inv.invoiceNumber.trim(),
        dispatch_date: inv.dispatchDate,
        client_id: inv.clientId,
        created_by: uid,
      })
      .select()
      .single();
    if (error) throw error;
    const invId = (data as InvoiceRow).id;
    await insertInvoiceItems(invId, inv.items);
    await refreshInvoice(invId);
    void logActivity("Invoices", "CREATE", "Invoice", inv.invoiceNumber);
    await syncPOStatuses(inv.items.map((i) => i.poId).filter(Boolean) as string[]);
    return state.invoices.find((i) => i.id === invId)!;
  },
  async updateInvoice(
    id: string,
    inv: Omit<Invoice, "id" | "createdAt" | "createdBy" | "items"> & { items: Omit<InvoiceItem, "id" | "invoiceId">[] },
  ) {
    const prev = state.invoices.find((i) => i.id === id);
    const prevPoIds = prev ? prev.items.map((i) => i.poId).filter(Boolean) as string[] : [];
    const { error } = await supabase
      .from("invoices")
      .update({
        invoice_number: inv.invoiceNumber.trim(),
        dispatch_date: inv.dispatchDate,
        client_id: inv.clientId,
      })
      .eq("id", id);
    if (error) throw error;
    const del = await supabase.from("invoice_items").delete().eq("invoice_id", id);
    if (del.error) throw del.error;
    await insertInvoiceItems(id, inv.items);
    await refreshInvoice(id);
    void logActivity("Invoices", "EDIT", "Invoice", inv.invoiceNumber);
    const nextPoIds = inv.items.map((i) => i.poId).filter(Boolean) as string[];
    await syncPOStatuses([...prevPoIds, ...nextPoIds]);
  },
  async deleteInvoice(id: string) {
    const existing = state.invoices.find((i) => i.id === id);
    const affected = existing ? existing.items.map((i) => i.poId).filter(Boolean) as string[] : [];
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) throw error;
    set({ ...state, invoices: state.invoices.filter((i) => i.id !== id) });
    void logActivity("Invoices", "DELETE", "Invoice", existing?.invoiceNumber ?? id);
    await syncPOStatuses(affected);
  },

  // ---- Sales Returns ----
  async addSalesReturn(
    r: Omit<SalesReturn, "id" | "createdAt" | "createdBy" | "items"> & { items: Omit<SalesReturnItem, "id" | "returnId">[] },
  ): Promise<SalesReturn> {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await supabase
      .from("sales_returns")
      .insert({
        return_number: r.returnNumber.trim(),
        return_date: r.returnDate,
        client_id: r.clientId,
        doc_type: r.docType,
        reference_number: r.referenceNumber || null,
        due_date: r.dueDate || null,
        remarks: r.remarks || null,
        created_by: uid,
      })
      .select()
      .single();
    if (error) throw error;
    const rid = (data as { id: string }).id;
    await insertReturnItems(rid, r.items);
    await refreshSalesReturn(rid);
    void logActivity("Sales Returns", "CREATE", "Sales Return", r.returnNumber);
    await syncPOStatuses(r.items.map((i) => i.poId).filter(Boolean) as string[]);
    return state.salesReturns.find((x) => x.id === rid)!;
  },
  async updateSalesReturn(
    id: string,
    r: Omit<SalesReturn, "id" | "createdAt" | "createdBy" | "items"> & { items: Omit<SalesReturnItem, "id" | "returnId">[] },
  ) {
    const prev = state.salesReturns.find((x) => x.id === id);
    const prevPoIds = prev ? (prev.items.map((i) => i.poId).filter(Boolean) as string[]) : [];
    const { error } = await supabase
      .from("sales_returns")
      .update({
        return_number: r.returnNumber.trim(),
        return_date: r.returnDate,
        client_id: r.clientId,
        doc_type: r.docType,
        reference_number: r.referenceNumber || null,
        due_date: r.dueDate || null,
        remarks: r.remarks || null,
      })
      .eq("id", id);
    if (error) throw error;
    const del = await supabase.from("sales_return_items").delete().eq("return_id", id);
    if (del.error) throw del.error;
    await insertReturnItems(id, r.items);
    await refreshSalesReturn(id);
    void logActivity("Sales Returns", "EDIT", "Sales Return", r.returnNumber);
    await syncPOStatuses([...prevPoIds, ...(r.items.map((i) => i.poId).filter(Boolean) as string[])]);
  },
  async deleteSalesReturn(id: string) {
    const existing = state.salesReturns.find((x) => x.id === id);
    const affected = existing ? (existing.items.map((i) => i.poId).filter(Boolean) as string[]) : [];
    const { error } = await supabase.from("sales_returns").delete().eq("id", id);
    if (error) throw error;
    set({ ...state, salesReturns: state.salesReturns.filter((x) => x.id !== id) });
    void logActivity("Sales Returns", "DELETE", "Sales Return", existing?.returnNumber ?? id);
    await syncPOStatuses(affected);
  },
  /** Mark an untraceable (standalone) return line as settled / unsettled. */
  async setReturnItemSettled(returnId: string, itemId: string, settled: boolean) {
    const item = state.salesReturns.find((r) => r.id === returnId)?.items.find((i) => i.id === itemId);
    const { error } = await supabase
      .from("sales_return_items")
      .update({ settled, settled_qty: settled ? (item?.returnQty ?? 0) : 0 })
      .eq("id", itemId);
    if (error) throw error;
    set({
      ...state,
      salesReturns: state.salesReturns.map((r) =>
        r.id !== returnId ? r : {
          ...r,
          items: r.items.map((i) => (i.id === itemId ? { ...i, settled, settledQty: settled ? i.returnQty : 0 } : i)),
        },
      ),
    });
  },
};

async function syncPOStatuses(poIds: string[]) {
  const unique = Array.from(new Set(poIds));
  if (!unique.length) return;
  const byItem = netDispatchedByPOItem(state.invoices, state.salesReturns);
  const byPo = netDispatchedByPO(state.invoices, state.salesReturns);
  for (const poId of unique) {
    const po = state.purchaseOrders.find((p) => p.id === poId);
    if (!po) continue;
    const fulfil = poFulfillmentStatus(po, byItem, byPo);
    if (fulfil === "Completed" && po.status === "open") {
      try { await store.updatePOStatus(po.id, "completed"); } catch (e) { console.error(e); }
    } else if (fulfil !== "Completed" && po.status === "completed") {
      try { await store.updatePOStatus(po.id, "open"); } catch (e) { console.error(e); }
    }
  }
}

async function insertInvoiceItems(invoiceId: string, items: Omit<InvoiceItem, "id" | "invoiceId">[]) {
  if (!items.length) return;
  const rows = items.map((i, idx) => ({
    invoice_id: invoiceId,
    po_id: i.poId,
    po_item_id: i.poItemId,
    po_number: i.poNumber,
    article_code: i.articleCode,
    lace_type: i.laceType,
    material_type: i.materialType,
    width: i.width,
    length: i.length,
    color: i.color,
    uom: i.uom,
    dispatch_qty: i.dispatchQty,
    rate: i.rate,
    sort_order: idx,
  }));
  const { error } = await supabase.from("invoice_items").insert(rows);
  if (error) throw error;
}

async function refreshInvoice(id: string) {
  const { data, error } = await supabase
    .from("invoices")
    .select("*, invoice_items(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  const inv = toInvoice(data as InvoiceRow);
  const existing = state.invoices.find((i) => i.id === id);
  set({
    ...state,
    invoices: existing
      ? state.invoices.map((i) => (i.id === id ? inv : i))
      : [inv, ...state.invoices],
  });
}

async function insertReturnItems(returnId: string, items: Omit<SalesReturnItem, "id" | "returnId">[]) {
  if (!items.length) return;
  const rows = items.map((i, idx) => ({
    return_id: returnId,
    invoice_id: i.invoiceId,
    invoice_item_id: i.invoiceItemId,
    invoice_number: i.invoiceNumber || null,
    po_id: i.poId,
    po_item_id: i.poItemId,
    po_number: i.poNumber || null,
    article_code: i.articleCode,
    lace_type: i.laceType,
    material_type: i.materialType,
    width: i.width,
    length: i.length,
    color: i.color,
    uom: i.uom,
    return_qty: i.returnQty,
    rate: i.rate,
    reason: i.reason || null,
    settled: i.settled,
    settled_qty: i.settledQty,
    sort_order: idx,
  }));
  const { error } = await supabase.from("sales_return_items").insert(rows);
  if (error) throw error;
}

async function refreshSalesReturn(id: string) {
  const { data, error } = await supabase
    .from("sales_returns")
    .select("*, sales_return_items(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  const r = toSalesReturn(data as unknown as SalesReturnRow);
  const existing = state.salesReturns.find((x) => x.id === id);
  set({
    ...state,
    salesReturns: existing
      ? state.salesReturns.map((x) => (x.id === id ? r : x))
      : [r, ...state.salesReturns],
  });
}

async function refreshInvoiceUnused(id: string) {
  const { data, error } = await supabase
    .from("invoices")
    .select("*, invoice_items(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  const inv = toInvoice(data as InvoiceRow);
  const existing = state.invoices.find((i) => i.id === id);
  set({
    ...state,
    invoices: existing
      ? state.invoices.map((i) => (i.id === id ? inv : i))
      : [inv, ...state.invoices],
  });
}

// ---- Bulk import helpers ----

export type DuplicateStrategy = "skip" | "update" | "replace";

export interface BulkPOInput {
  poNumber: string;
  brandId: string;
  clientId: string;
  poDate: string;
  deliveryDate: string;
  items: Omit<POLineItem, "id">[];
}

export const bulkImport = {
  async ensureBrand(name: string): Promise<{ id: string; created: boolean }> {
    const trimmed = name.trim();
    const existing = state.brands.find(
      (b) => b.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) return { id: existing.id, created: false };
    const b = await store.addBrand(trimmed);
    return { id: b.id, created: true };
  },
  async ensureClient(name: string): Promise<{ id: string; created: boolean }> {
    const trimmed = name.trim();
    const existing = state.clients.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) return { id: existing.id, created: false };
    const nc = await store.addClient({
      name: trimmed,
      address: "",
      gstNumber: "",
      phone: "",
      email: "",
    });
    return { id: nc.id, created: true };
  },
  findPOByNumber(poNumber: string, clientId?: string): PurchaseOrder | undefined {
    return state.purchaseOrders.find(
      (p) => p.poNumber === poNumber && (clientId ? p.clientId === clientId : true),
    );
  },
  async createPO(input: BulkPOInput): Promise<{ poId: string; itemCount: number }> {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await supabase
      .from("purchase_orders")
      .insert({
        po_number: input.poNumber,
        brand_id: input.brandId,
        client_id: input.clientId,
        po_date: input.poDate,
        delivery_date: input.deliveryDate,
        status: "open",
        created_by: uid,
      })
      .select()
      .single();
    if (error) throw error;
    const poId = (data as PORow).id;
    const items: POLineItem[] = input.items.map((i) => ({ ...i, id: crypto.randomUUID() }));
    await insertItems(poId, items);
    await refreshPO(poId);
    return { poId, itemCount: items.length };
  },
  async appendItemsToPO(poId: string, items: Omit<POLineItem, "id">[]): Promise<number> {
    const withIds: POLineItem[] = items.map((i) => ({ ...i, id: crypto.randomUUID() }));
    await insertItems(poId, withIds);
    await refreshPO(poId);
    return withIds.length;
  },
  async replacePO(poId: string, input: BulkPOInput): Promise<number> {
    const { error } = await supabase
      .from("purchase_orders")
      .update({
        brand_id: input.brandId,
        client_id: input.clientId,
        po_date: input.poDate,
        delivery_date: input.deliveryDate,
        status: "open",
      })
      .eq("id", poId);
    if (error) throw error;
    // Diff by natural key (article/lace/material/width/length/color/uom) so
    // existing UUIDs — and any invoice_items.po_item_id links to them — are
    // preserved across re-imports. Quantity and rate are excluded on purpose:
    // they legitimately change when a PO is revised.
    const items: POLineItem[] = input.items.map((i) => ({ ...i, id: crypto.randomUUID() }));
    await diffUpsertItemsByNaturalKey(poId, items);
    await refreshPO(poId);
    return items.length;
  },
  async logImport(record: {
    fileName: string;
    totalRows: number;
    successfulRows: number;
    failedRows: number;
    posCreated: number;
    posUpdated: number;
    lineItemsCreated: number;
    brandsCreated: number;
    clientsCreated: number;
    status: string;
    errors?: unknown;
  }) {
    const u = (await supabase.auth.getUser()).data.user;
    await supabase.from("po_import_history").insert({
      file_name: record.fileName,
      uploaded_by: u?.id ?? null,
      uploaded_by_email: u?.email ?? null,
      total_rows: record.totalRows,
      successful_rows: record.successfulRows,
      failed_rows: record.failedRows,
      pos_created: record.posCreated,
      pos_updated: record.posUpdated,
      line_items_created: record.lineItemsCreated,
      brands_created: record.brandsCreated,
      clients_created: record.clientsCreated,
      status: record.status,
      errors: record.errors ?? null,
    });
    void logActivity("PO Imports", "IMPORT", "Excel", record.fileName);
  },
  async fetchImportHistory() {
    const { data, error } = await supabase
      .from("po_import_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  },
};

async function insertItems(poId: string, items: POLineItem[]) {
  if (!items.length) return;
  const rows = items.map((i, idx) => ({
    id: i.id,
    po_id: poId,
    article_code: i.articleCode,
    lace_type: i.laceType,
    material_type: i.materialType,
    width: i.width,
    length: i.length,
    color: i.color,
    uom: i.uom,
    quantity: i.quantity,
    rate: i.rate,
    sort_order: idx,
  }));
  const { error } = await supabase.from("purchase_order_items").insert(rows);
  if (error) throw error;
}

// Diff by row id: update rows still present, insert new ones, delete removed ones.
// Preserves purchase_order_items.id so invoice_items.po_item_id FK links stay intact.
async function diffUpsertItems(poId: string, items: POLineItem[]) {
  const { data: existing, error: exErr } = await supabase
    .from("purchase_order_items")
    .select("id")
    .eq("po_id", poId);
  if (exErr) throw exErr;
  const existingIds = new Set((existing ?? []).map((r) => (r as { id: string }).id));
  const incomingIds = new Set(items.map((i) => i.id));
  const toDelete = [...existingIds].filter((x) => !incomingIds.has(x));
  if (toDelete.length) {
    const { error } = await supabase.from("purchase_order_items").delete().in("id", toDelete);
    if (error) throw error;
  }
  if (items.length) {
    const rows = items.map((i, idx) => ({
      id: i.id,
      po_id: poId,
      article_code: i.articleCode,
      lace_type: i.laceType,
      material_type: i.materialType,
      width: i.width,
      length: i.length,
      color: i.color,
      uom: i.uom,
      quantity: i.quantity,
      rate: i.rate,
      sort_order: idx,
    }));
    const { error } = await supabase
      .from("purchase_order_items")
      .upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
}

// For re-imports where incoming items have fresh UUIDs: reuse an existing row's
// id when article/width/length/color match, so invoice links survive re-import.
function norm(v: string | null | undefined) {
  return (v ?? "").trim().toLowerCase();
}
async function diffUpsertItemsByNaturalKey(poId: string, items: POLineItem[]) {
  const { data: existingRows, error: exErr } = await supabase
    .from("purchase_order_items")
    .select("id, article_code, lace_type, material_type, width, length, color, uom")
    .eq("po_id", poId);
  if (exErr) throw exErr;
  type Row = {
    id: string;
    article_code: string | null;
    lace_type: string | null;
    material_type: string | null;
    width: string | null;
    length: string | null;
    color: string | null;
    uom: string | null;
  };
  const existing = (existingRows ?? []) as Row[];
  const usedExisting = new Set<string>();
  const remapped: POLineItem[] = items.map((i) => {
    const match = existing.find(
      (e) =>
        !usedExisting.has(e.id) &&
        norm(e.article_code) === norm(i.articleCode) &&
        norm(e.lace_type) === norm(i.laceType) &&
        norm(e.material_type) === norm(i.materialType) &&
        norm(e.width) === norm(i.width) &&
        norm(e.length) === norm(i.length) &&
        norm(e.color) === norm(i.color) &&
        norm(e.uom) === norm(i.uom),
    );
    if (match) {
      usedExisting.add(match.id);
      return { ...i, id: match.id };
    }
    return i;
  });
  await diffUpsertItems(poId, remapped);
}

async function refreshPO(id: string) {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*, purchase_order_items(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  const po = toPO(data as PORow);
  const existing = state.purchaseOrders.find((p) => p.id === id);
  set({
    ...state,
    purchaseOrders: existing
      ? state.purchaseOrders.map((p) => (p.id === id ? po : p))
      : [po, ...state.purchaseOrders],
  });
}

export function useStore<T>(selector: (s: StoreShape) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(state),
    () => selector(empty),
  );
}

export function nextPONumber(existing: PurchaseOrder[]): string {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const nums = existing
    .map((p) => p.poNumber)
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}