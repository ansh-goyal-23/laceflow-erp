# Yarn Management Module

A new top-level module covering the full yarn procurement lifecycle: suppliers → shade approval → production ordering → receipt & allocation → dynamic procurement stage on POs.

## 1. Database (single migration)

New tables in `public`, all with GRANTs + RLS (authenticated read/write, service_role all; admin-only delete on masters). Indexes on every column used for lookup/join.

```text
suppliers (id uuid pk, name, contact_person, mobile, email, address, gst, remarks, created_at/by, updated_at/by)

shade_library (
  id uuid pk, client_id, brand_id, color_name, material,
  supplier_id, supplier_shade_number,
  approval_date date, status text check in ('approved','inactive'),
  created_at/by, updated_at/by)
  idx: (client_id, brand_id, color_name, material, supplier_id)
  idx: (supplier_id, supplier_shade_number)

sample_yarn_orders (
  id uuid pk, number text unique, order_date date, supplier_id,
  linked_po_id uuid null, expected_delivery date (order_date+7), remarks,
  status text ('draft','ordered','received','approved','redye','cancelled'))
sample_yarn_order_items (
  id, order_id fk cascade, client_id, brand_id, color_name, material,
  approx_qty numeric, swatch_url, pantone, remarks,
  approval_status text ('pending','approved','redye'),
  approved_shade_id uuid null)
sample_yarn_receipts (
  id, order_id fk, receipt_date, supplier_id, supplier_shade_number,
  lot_number, gross_weight numeric, cones int, remarks)

production_yarn_orders (
  id uuid pk, number text unique, order_date date, supplier_id, remarks,
  status text ('draft','ordered','partially_received','received','cancelled'))
production_yarn_order_items (
  id, order_id fk cascade, po_id, po_item_id null,
  client_id, brand_id, material, color_name,
  ordered_qty numeric, received_qty numeric default 0,
  approved_shade_id, supplier_shade_number)
  idx: (po_id, material, color_name), (supplier_id via join)

yarn_receipts (
  id, receipt_date, supplier_id, supplier_shade_number, lot_number,
  gross_weight numeric, cones int, unallocated_qty numeric, remarks)
yarn_receipt_allocations (
  id, receipt_id fk cascade, prod_order_item_id fk, qty numeric)
  idx: (prod_order_item_id), (receipt_id)

po_item_procurement_override (
  po_item_id pk fk, override text check in ('yarn_not_required'))

procurement_stage_cache (
  po_id, material, color_name, stage text, updated_at,
  pk (po_id, material, color_name))
  idx: (po_id)
```

Stage values: `in_sampling`, `waiting_for_yarn_order`, `waiting_for_yarn_receipt`, `production_pending`, `yarn_not_required`.

## 2. Procurement stage service

`src/lib/yarn/stage.functions.ts`:
- `calculateProcurementStage({ poId, material, color })` — pure SQL against sample orders, prod orders, allocations, override; returns stage.
- `recalcStageFor(poId, material?, color?)` — recomputes and upserts into `procurement_stage_cache`. Called from every write path (sample create/approve/redye, prod order create/edit/cancel, receipt allocate, override change, PO item edit/delete).
- `getPoOverallStage(poId)` — reads cache, returns earliest incomplete stage across items (ignoring `yarn_not_required`).
- Cache is optimization only; list queries join the cache but the service is the source of truth.

## 3. Server functions (`src/lib/yarn/*.functions.ts`)

All `createServerFn` + `requireSupabaseAuth`. Grouped by entity:
- `suppliers.functions.ts` — list/create/update/delete + search.
- `shades.functions.ts` — list (filters: client, brand, color, material, supplier, shade #), create/update/deactivate; helper `ensureShade(...)` for auto-add from sample approval & "Add New Shade".
- `sample-orders.functions.ts` — CRUD, add receipt, approve/redye (approve → `ensureShade` + set `approved_shade_id` + recalc stage on linked PO).
- `production-orders.functions.ts` — CRUD; `eligiblePOs()` returns POs whose overall stage ∈ {`waiting_for_yarn_order`,`in_sampling`}, sorted overdue → ≤10d → rest; `poItemsForProcurement(poId)` returns full item list + per-item stage.
- `receipts.functions.ts` — create receipt; auto-allocation logic (Case 1 full auto, Case 2 returns pending breakdown for popup; second call commits allocations after client-side entry with server-side validation: sum == received, none exceeds pending). Recalcs stage for each touched (po, material, color).
- `overrides.functions.ts` — upsert/clear `yarn_not_required` per po_item; recalc.

All writes call `logAudit(...)`.

## 4. Routes (all under `_authenticated/`)

```text
yarn/suppliers.tsx
yarn/shades.tsx
yarn/sample-orders.index.tsx
yarn/sample-orders.new.tsx
yarn/sample-orders.$id.tsx           (view + receipt + approve/redye + print)
yarn/production-orders.index.tsx
yarn/production-orders.new.tsx       (split-screen procurement UI)
yarn/production-orders.$id.tsx
yarn/receipts.index.tsx
yarn/receipts.new.tsx                (with allocation dialog)
```

Sidebar: new "Yarn Management" collapsible group with the 5 sections, above "Reports".

Every list page: global search, column filters, brand/client/date filters where applicable, sortable columns, sticky header, pagination, CSV+Excel export (reusing `export-table.ts`).

## 5. Split-screen procurement UI (`production-orders.new.tsx`)

- **Left**: read-only full PO (all items, never hidden) with per-item calculated stage badge or `Yarn Not Required` when overridden. Columns per spec.
- **Right**: supplier select → Add PO (dialog listing eligible POs sorted by urgency) → per selected PO: color dropdown (all colors, none hidden) → qty (Kg) → approved shade dropdown filtered by client+brand+material+color+supplier → `+ Add New Shade` inline (asks for supplier shade #, calls `ensureShade`, uses immediately) → **Sampling toggle** (default OFF).
  - OFF → adds a production yarn order line for that (po, color, material).
  - ON → creates a Sample Yarn Order (linked PO auto-populated) instead; line skipped.
- Save creates one Production Yarn Order per supplier session; multiple POs/colors per order supported.

## 6. Sample Yarn Orders

- Auto number (`SYO-YYYY-####`), expected delivery = order date + 7d (computed, not editable).
- Multi-item form (Client / Brand / Color / Material / Approx Qty / swatch upload to Supabase Storage bucket `yarn-swatches` / pantone / remarks).
- Detail page: printable view (`window.print` styles), add receipt, per-item Approve / Redye. Approve auto-creates shade via `ensureShade`, sets Approval Date=today, Status=approved; if `linked_po_id` set, recalcs that (po, material, color) stage.

## 7. Yarn Receipts

- Form: receipt_date, supplier, supplier_shade_number, lot, gross_weight, cones, remarks.
- On submit: server finds open prod order items matching (supplier, supplier_shade_number) with `received_qty < ordered_qty`, ordered by delivery urgency.
  - **Case 1** (received ≥ total pending): auto-allocate exact pending to each, remainder → `unallocated_qty`. No popup.
  - **Case 2** (received < total pending): server returns breakdown; client shows allocation dialog (client/po/material/color/ordered/received/pending/allocate). Validation enforced client + server. On confirm, allocations written, stages recalced.

## 8. Overall PO stage integration

- `getPoOverallStage` used in: PO List (new "Procurement Stage" column), Reports pages, Production Yarn Order → Add PO dialog. Reads cache; falls back to on-demand recalc when cache row missing.

## 9. Files touched

- New migration under `supabase/migrations/`.
- New: `src/lib/yarn/` (stage + 6 functions files + shared types), 11 route files, 1 sidebar edit, 1 supabase storage bucket (`yarn-swatches`, private, RLS to authenticated).
- Edited: `src/components/app-sidebar.tsx` (add group), `src/routes/_authenticated/purchase-orders.index.tsx` (add stage column via cache read).
- No changes to existing invoice/dispatch/PO write logic beyond a stage-recalc hook when a PO item is edited/deleted.

## Notes / assumptions

- Supabase Storage bucket `yarn-swatches` (private) for optional swatch uploads.
- "Client" in Sample/Prod order items references existing `clients`; brand references `brands`.
- `material` is a free-text field matching how POs already store it.
- Delete of masters (supplier, shade) is soft (set inactive) when referenced by any order; hard delete only when unused.
- All server writes wrapped in try/catch that also `logAudit(...)` (module: "Yarn Management").
- Print layout uses a print-only CSS block in the sample-order detail route.

Proceeding will produce a large batch of files (~20 new + 2 edits + 1 migration). Confirm to build.
