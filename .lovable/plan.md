## Goal

Today only header fields can be edited: Production/Sample orders expose a small dialog (order date, status, remarks) and Yarn Inward has no edit at all (only View + Delete). Make all three fully editable — header **and** line items — with safeguards for quantities already received/allocated.

## What gets built

### 1. Yarn Inward — new Edit screen
- New route `/yarn/inwards/$id/edit`, reusing the same form layout as `yarn/inwards/new` (date, supplier, challan, remarks, item rows with color, shade #, lot, gross, cones, paper-tube override, remarks; net auto-calculated as `Gross − Cones × Tube Wt`).
- Add an Edit (pencil) button next to View/Delete in the Yarn Inward register rows and on the inward detail page.
- Safeguards:
  - An item row that already has allocations to a production order is locked for shade/color changes, and its net weight cannot be reduced below the allocated quantity.
  - Rows already allocated cannot be deleted; the message tells the user to remove the allocation first.
  - Rows linked to a sample order keep their link; changing weights/lot updates the mirrored sample receipt so the sample order and Approvals tab stay in sync.
  - Changing the supplier is blocked once any row is allocated or mirrored to a sample receipt (that link is supplier-specific).

### 2. Production Yarn Order — full edit
- New route `/yarn/production-orders/$id/edit` reusing the existing "New Production Order" builder (PO picker with search + PO date, color expansion, editable Material, quantity, shade, reason), pre-populated from the saved order.
- The existing pencil buttons in the list and on the detail page navigate to this screen instead of opening the small dialog. Header fields (date, supplier, status, remarks) stay editable there too.
- Safeguards: an item with `receivedQty > 0` cannot be deleted and its ordered qty cannot go below the received qty; its color/shade are read-only (lock icon + tooltip, same pattern as the PO form).

### 3. Sample Yarn Order — full edit
- New route `/yarn/sample-orders/$id/edit` reusing the "New Sample Yarn Order" form (supplier, order date, linked PO, remarks, item rows: client, brand, color, material, approx qty, pantone, remarks).
- Pencil buttons in list and detail page route here.
- Safeguards: items already approved or with a matched physical receipt are read-only and cannot be deleted; everything else is freely editable.

## Technical notes

- `src/lib/yarn-store.ts` gains three item-aware update functions:
  - `updateInwardFull(id, { header, items })` — diffs saved vs submitted rows: update changed rows, insert new ones, delete removed ones, recompute `net_weight`, and re-sync the mirrored `yarn_sample_receipts` row (including the `[[soi:<id>]]` marker) for sample-tagged rows.
  - `updateProductionOrderFull(id, { header, items })` — same insert/update/delete diff on `yarn_production_order_items`, preserving existing row ids (and therefore `received_qty` and allocations); order status recomputed by the existing `computeProdStatus`.
  - `updateSampleOrderFull(id, { header, items })` — same diff on `yarn_sample_order_items`, preserving `approval_status` / `approved_shade_id` on retained rows.
- Row ids are preserved on retained rows so allocations and invoice-style FK links are never broken.
- Each save runs behind a `saving` guard (disabled button) to avoid duplicate submissions, then `refresh()`.
- No schema migration needed — all fields already exist.

## Out of scope

- Editing the auto-generated order/inward numbers.
- Re-running auto-allocation on edit (existing allocations are preserved; new/increased quantities can be allocated from the Pending Allocation screen as usual).
