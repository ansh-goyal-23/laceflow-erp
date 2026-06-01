import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Brand {
  id: string;
  name: string;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  address: string;
  gstNumber: string;
  phone: string;
  email: string;
  createdAt: string;
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

type BrandRow = { id: string; name: string; created_at: string };
type ClientRow = {
  id: string;
  name: string;
  address: string | null;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
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
  purchase_order_items: POItemRow[];
};

const toBrand = (r: BrandRow): Brand => ({ id: r.id, name: r.name, createdAt: r.created_at });
const toClient = (r: ClientRow): Client => ({
  id: r.id,
  name: r.name,
  address: r.address ?? "",
  gstNumber: r.gstin ?? "",
  phone: r.phone ?? "",
  email: r.email ?? "",
  createdAt: r.created_at,
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
  async addClient(c: Omit<Client, "id" | "createdAt">): Promise<Client> {
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
  async updateClient(id: string, c: Omit<Client, "id" | "createdAt">) {
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
  async addPO(po: Omit<PurchaseOrder, "id" | "createdAt">): Promise<PurchaseOrder> {
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
  async updatePO(id: string, po: Omit<PurchaseOrder, "id" | "createdAt">) {
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

async function insertItems(poId: string, items: POLineItem[]) {
  if (!items.length) return;
  const rows = items.map((i, idx) => ({
    po_id: poId,
    article_code: i.articleCode,
    lace_type: i.laceType,
    material_type: i.materialType,
    no_of_colors: i.noOfColors,
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