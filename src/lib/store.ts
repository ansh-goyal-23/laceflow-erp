import { useSyncExternalStore } from "react";

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
  noOfColors: string;
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

const KEY = "shree_lace_erp_v1";

function isClient() {
  return typeof window !== "undefined";
}

function load(): StoreShape {
  if (!isClient()) return { brands: [], clients: [], purchaseOrders: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { brands: [], clients: [], purchaseOrders: [] };
    return JSON.parse(raw) as StoreShape;
  } catch {
    return { brands: [], clients: [], purchaseOrders: [] };
  }
}

let state: StoreShape = load();
const listeners = new Set<() => void>();

function persist() {
  if (isClient()) localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const store = {
  getSnapshot: () => state,
  // Brands
  addBrand(name: string): Brand {
    const b: Brand = { id: crypto.randomUUID(), name: name.trim(), createdAt: new Date().toISOString() };
    state = { ...state, brands: [...state.brands, b] };
    persist();
    return b;
  },
  updateBrand(id: string, name: string) {
    state = { ...state, brands: state.brands.map((b) => (b.id === id ? { ...b, name: name.trim() } : b)) };
    persist();
  },
  deleteBrand(id: string) {
    state = { ...state, brands: state.brands.filter((b) => b.id !== id) };
    persist();
  },
  // Clients
  addClient(c: Omit<Client, "id" | "createdAt">): Client {
    const nc: Client = { ...c, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    state = { ...state, clients: [...state.clients, nc] };
    persist();
    return nc;
  },
  updateClient(id: string, c: Omit<Client, "id" | "createdAt">) {
    state = { ...state, clients: state.clients.map((x) => (x.id === id ? { ...x, ...c } : x)) };
    persist();
  },
  deleteClient(id: string) {
    state = { ...state, clients: state.clients.filter((c) => c.id !== id) };
    persist();
  },
  // POs
  addPO(po: Omit<PurchaseOrder, "id" | "createdAt">): PurchaseOrder {
    const npo: PurchaseOrder = { ...po, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    state = { ...state, purchaseOrders: [...state.purchaseOrders, npo] };
    persist();
    return npo;
  },
  updatePO(id: string, po: Omit<PurchaseOrder, "id" | "createdAt">) {
    state = {
      ...state,
      purchaseOrders: state.purchaseOrders.map((p) => (p.id === id ? { ...p, ...po } : p)),
    };
    persist();
  },
  deletePO(id: string) {
    state = { ...state, purchaseOrders: state.purchaseOrders.filter((p) => p.id !== id) };
    persist();
  },
  subscribe,
};

export function useStore<T>(selector: (s: StoreShape) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(state),
    () => selector({ brands: [], clients: [], purchaseOrders: [] }),
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