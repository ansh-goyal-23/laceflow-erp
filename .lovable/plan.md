## Overview

Refactor Yarn Management to be **color-centric** (not PO-item-centric), simplify the Yarn Inward workflow, and infer Production vs Sample receipts automatically from the shade dropdown behavior. Existing business logic (status calc, sample/production workflows, allocation, reports, inventory) stays intact.

## Scope of changes

### 1. Production Yarn Order — Color-centric UI
File: `src/routes/_authenticated/yarn.production-orders.new.tsx`
- Replace the item-level PO table on the left with a **Color Group** list, grouped by `color` from `po.items`.
- Each group row shows: Color name, type (Base/Line — derived from item `colorType` if present, otherwise inferred; if not available, show "Color"), procurement status badge (reuse existing per-item stage logic — a group is at the "least advanced" stage of its items), Ordered Qty (sum from prod orders for this PO+color), Received Qty (sum from prod order items).
- Expand/collapse (chevron) reveals the individual items using that color (article, W×L, qty, uom) — read-only reference.
- "Add" button on each color pushes a procurement line pre-populated with `{poId, color, material}` (no `poItemId` — line is color-scoped). Multiple lines per color allowed (multiple production orders).
- Add optional **Reason** field per line (dropdown: Additional Requirement / Production Wastage / Shade Difference / Other) — stored in `remarks` of the production order item, or new column if simple.
- Add an advanced **Split Color** toggle (hidden by default under a "More" popover) that lets one color spawn multiple lines with different shades — this is just UI; multiple lines already achieve it.
- Remove the per-color-selector dropdown inside each procurement line (color is fixed by which group's Add button was clicked); keep material inferred from the group.

### 2. Data model tweak (minimal)
File: `src/lib/yarn-store.ts`
- Add optional `reason?: string` to `ProductionYarnOrderItem` and DB column `reason text` on `yarn_production_order_items`.
- Keep `poItemId` nullable — color-scoped lines pass `null`.
- No schema change to color grouping (already have `color_name` + `material` on prod items).
- Migration SQL added to `docs/yarn-management.sql` (append `ALTER TABLE ... ADD COLUMN reason text;`).

### 3. Yarn Inward — simplification
Files: `src/routes/_authenticated/yarn.inwards.new.tsx`, `yarn.inwards.$id.tsx`, `yarn-store.ts`
- Header: keep Inward#, Inward Date, Supplier, Supplier Challan#, Remarks. Confirm Vehicle# / LR# are already removed (they are).
- Item row columns: **Color**, **Supplier Shade #**, Lot#, Gross Weight, Cones, Net Weight (auto), Remarks, + optional "Override paper tube weight" (small toggle → number field).
- Paper tube weight is pulled from supplier's `defaultPaperTubeWeight` automatically; not shown as a column.
- **Color dropdown**: after supplier is selected, populate only with colors that have a pending qty (ordered − received > 0) in either Production Yarn Orders **or** Sample Yarn Orders for this supplier. No free text.
- **Supplier Shade # field**: searchable combobox with free-text.
  - If user picks an existing shade from the dropdown → treated as **Production Receipt** (existing allocation flow to matching prod order item).
  - If user types a new shade not in the list → treated as **Sample Receipt**; on save, auto-append a `SampleYarnReceipt` to the pending Sample Yarn Order for this supplier+color; the shade string will be added to the Shade Library when the sample is later approved (existing sample-approval path already does this — verify).
  - Dropdown source: `shades` filtered by `supplierId + colorName` **plus** shades already present on prod-order items for this supplier+color.
- Net Weight = `grossWeight − cones × paperTubeWeight` (existing; verified server-side too).

### 4. Pending allocation — unchanged behavior
- Auto-allocate when exactly one matching Production Yarn Order item exists for supplier+shade+color; otherwise create a pending allocation task (existing popup). Sample-flagged rows do not enter allocation queue — they flow into the linked Sample Order's receipts.

### 5. Preserved
Procurement Status calc (allocated Net Yarn Weight only), sample workflow, production workflow, allocation logic, reports, inventory, existing routes and sidebar entries.

## Out of scope
- Renaming existing tables.
- Reworking Sample Orders module UI (only receipt-linking logic touched).
- Any change to Inventory or Reports code.

## Technical notes
- Color grouping keyed by `color` string alone (per spec: "one color = one shade" normally). Material shown as metadata inside the group.
- "Base / Line" color type: `POLineItem` currently has no `colorType`. If not present, show item's `laceType` or omit the badge — will confirm from `store.ts` during implementation and either add optional field or drop the badge.
- Split Color: implemented purely as "add another line for the same color with a different shade" — no schema change.

## Deliverables
- Edited: `yarn.production-orders.new.tsx`, `yarn.inwards.new.tsx`, `yarn.inwards.$id.tsx`, `yarn-store.ts`, `docs/yarn-management.sql`.
- No sidebar / route additions.
