## Goal

Split the current single "Yarn Receipt" screen into three independent screens:

1. **Yarn Inward** (Store dept) — records physical yarn only, no allocation.
2. **Pending Yarn Allocation** (Procurement) — auto- or manual-allocates each inward item to Production Yarn Orders.
3. **Unallocated Yarn** — remaining Net Weight after allocation, for future Inventory.

Procurement Stage calculations always use **allocated Net Yarn Weight**, never Gross Weight and never unallocated yarn.

## Data model changes (SQL migration – `docs/yarn-management.sql` additions)

Add to `yarn_suppliers`:
- `default_paper_tube_weight numeric NOT NULL DEFAULT 0` — default per-cone paper tube weight.

Replace the current single `yarn_receipts` (which stores one shade + gross weight) with a header/line model:

- `yarn_inwards` (header)
  - `id`, `number text UNIQUE` (auto `INW-YYYY-####`), `inward_date`, `supplier_id`,
    `supplier_challan_number text`, `remarks text`, `created_at`, `created_by`.
- `yarn_inward_items` (lines)
  - `id`, `inward_id → yarn_inwards`, `supplier_shade_number`, `lot_number`,
    `gross_weight`, `cones`, `paper_tube_weight`, `net_weight` (stored, = gross − cones×tube),
    `remarks`, `sort_order`.

Keep `yarn_receipt_allocations` but repoint FK to `yarn_inward_items`:
- Rename to `yarn_inward_allocations` with `inward_item_id`.
- `qty numeric CHECK (qty > 0)` — this qty is in **Net kg**.
- Unallocated qty is derived: `net_weight − SUM(allocations.qty)` (no stored `unallocated_qty` — always live-computed to avoid drift).

`yarn_production_order_items.received_qty` continues to track allocated Net kg (delta pattern preserved).

Grants + RLS mirroring `yarn_receipts` (created_by on header, child gated via parent).

The old `yarn_receipts` / `yarn_receipt_allocations` tables and old `unallocated_qty` field are dropped in the same migration.

## Store layer (`src/lib/yarn-store.ts`)

Rename all "receipt" terminology in the yarn-inward pipeline to "inward":

- New types:
  - `YarnInwardItem { id, supplierShadeNumber, lotNumber?, grossWeight, cones, paperTubeWeight, netWeight, remarks?, allocations: YarnInwardAllocation[] }`
  - `YarnInward { id, number, inwardDate, supplierId, supplierChallanNumber, remarks?, items: YarnInwardItem[], createdAt }`
  - `YarnInwardAllocation { id, inwardItemId, prodOrderItemId, qty }`
- `YarnSupplier` gains `defaultPaperTubeWeight: number`.

`StoreShape` field `receipts` → `inwards: YarnInward[]`.

New store methods:
- `addInward({ inwardDate, supplierId, supplierChallanNumber, remarks, items[] })` — inserts header + items; **no allocations**.
- `deleteInward(id)` — reverses any allocations first (adjust prod `received_qty`), then deletes.
- `deleteInwardItem(itemId)` — reverse its allocations, delete item.
- `allocateInwardItemAuto(itemId)` — if Net ≥ total pending for (supplier, shade), allocate all pending and return `{ done: true }`. Otherwise return `{ done: false, pendingRows }` for the popup.
- `allocateInwardItemManual(itemId, allocations[])` — validate total == net, insert rows, bump prod received_qty.

Helpers:
- `inwardItemAllocatedQty(item)` and `inwardItemUnallocatedQty(item) = net − allocated`.
- `getPendingRowsForShade(supplierId, shadeNumber)` unchanged.

Procurement stage functions keep using `productionOrderItems.receivedQty` — since only allocations bump it, the "allocated Net Yarn Weight only" rule holds automatically. No code path uses gross weight in stage calc.

Keep legacy `commitYarnReceipt`/`planYarnReceipt` **removed** — all callers updated.

## Route/UI changes (`src/routes/_authenticated/`)

Delete:
- `yarn.receipts.index.tsx`
- `yarn.receipts.new.tsx`

Add:
- `yarn.inwards.index.tsx` — list of Yarn Inwards. Columns: Number, Date, Supplier, Challan #, # Items, Total Net (Kg). Row → detail.
- `yarn.inwards.new.tsx` — Dispatch-style form.
  - Header: Inward Number (auto-preview from last number), Inward Date, Supplier (select), Supplier Challan #, Remarks.
  - Items grid: Supplier Shade #, Lot #, Gross, Cones, Paper Tube Wt/Cone (prefilled from supplier default, editable per row), Net (auto = gross − cones × tube, read-only), Remarks. Add/remove rows.
  - Submit → `addInward(...)`, redirect to list.
- `yarn.inwards.$id.tsx` — inward detail with items and per-item allocation summary.
- `yarn.pending-allocations.tsx` — lists every `YarnInwardItem` where `unallocated > 0` **AND** matching pending prod-order-items exist. Columns: Supplier, Inward #, Inward Date, Shade #, Lot #, Net (Kg), Unallocated (Kg), Allocation Status, "Allocate" button.
  - Clicking Allocate calls `allocateInwardItemAuto`. If `done`, toast + refresh. If not, open popup with editable qty per pending prod-order row (Client, PO, Material, Color, Ordered, Already Allocated, Pending, Allocate). Validation: each ≤ pending; total == net remaining to allocate. Submit calls `allocateInwardItemManual`.
- `yarn.unallocated.tsx` — lists all inward items with `unallocated > 0`. Columns: Supplier, Shade #, Lot #, Available Qty, Inward #, Inward Date.

Sidebar (`src/components/app-sidebar.tsx`) — under "Yarn Management" replace "Receipts" with:
- Yarn Inward
- Pending Yarn Allocation
- Unallocated Yarn

(Suppliers, Shades, Sample Orders, Production Orders remain.)

Supplier form (`src/routes/_authenticated/yarn.suppliers.tsx`) gains a "Default Paper Tube Weight per Cone (Kg)" numeric field.

## Non-goals / preservation

- Procurement Stage badges keep their current meanings; nothing on the PO screens changes.
- No changes to Sample Orders, Production Orders, Shades, or Suppliers screens beyond the new supplier field.
- Existing `yarn_receipts` rows are dropped by the migration (per user's earlier "never use Lovable Cloud migrations" — but here they explicitly asked for the schema change; migration file is authored as SQL for them to run manually).
