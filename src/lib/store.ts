import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  status: "draft" | "submitted";
  createdAt: string;
  createdBy: string | null;
}

type StoreShape = {
  brands: Brand[];
  clients: Client[];
  purchaseOrders: PurchaseOrder[];
};

const empty: StoreShape = { brands: [], clients: [], purchaseOrders: [] };
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
  status: "draft" | "submitted";
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
  createdAt: r.created_at,
  createdBy: r.created_by ?? null,
  items: (r.purchase_order_items ?? []).map(toItem),
});

// ---------- store ----------

export const store = {
  getSnapshot: () => state,
  subscribe,
  reset() {
    set(empty);
  },
  async hydrate() {
    const [b, c, p] = await Promise.all([
      supabase.from("brands").select("*").order("created_at"),
      supabase.from("clients").select("*").order("created_at"),
      supabase
        .from("purchase_orders")
        .select("*, purchase_order_items(*)")
        .order("created_at", { ascending: false }),
    ]);
    if (b.error) throw b.error;
    if (c.error) throw c.error;
    if (p.error) throw p.error;
    set({
      brands: (b.data as BrandRow[]).map(toBrand),
      clients: (c.data as ClientRow[]).map(toClient),
      purchaseOrders: (p.data as PORow[]).map(toPO),
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
    return b;
  },
  async updateBrand(id: string, name: string) {
    const { error } = await supabase.from("brands").update({ name: name.trim() }).eq("id", id);
    if (error) throw error;
    set({ ...state, brands: state.brands.map((b) => (b.id === id ? { ...b, name: name.trim() } : b)) });
  },
  async deleteBrand(id: string) {
    const { error } = await supabase.from("brands").delete().eq("id", id);
    if (error) throw error;
    set({ ...state, brands: state.brands.filter((b) => b.id !== id) });
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
  },
  async deleteClient(id: string) {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) throw error;
    set({ ...state, clients: state.clients.filter((c) => c.id !== id) });
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
    // Replace items: delete all then insert fresh
    const del = await supabase.from("purchase_order_items").delete().eq("po_id", id);
    if (del.error) throw del.error;
    await insertItems(id, po.items);
    await refreshPO(id);
  },
  async deletePO(id: string) {
    const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
    if (error) throw error;
    set({ ...state, purchaseOrders: state.purchaseOrders.filter((p) => p.id !== id) });
  },
};

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
        status: "submitted",
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
        status: "submitted",
      })
      .eq("id", poId);
    if (error) throw error;
    const del = await supabase.from("purchase_order_items").delete().eq("po_id", poId);
    if (del.error) throw del.error;
    const items: POLineItem[] = input.items.map((i) => ({ ...i, id: crypto.randomUUID() }));
    await insertItems(poId, items);
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