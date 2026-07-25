## Goal
Prevent editing/removing a PO line item once any invoice has dispatched quantity against it. New items can still be added, and items with zero dispatched qty remain fully editable.

## Rules
For each existing PO item, compute `dispatched = sum(invoice_items.dispatch_qty where po_item_id = it.id)` using the existing `dispatchedByPOItem(invoices)` helper.

An item is **locked** when `dispatched > 0`. For locked items:
- Fields locked (read-only): article code, lace type, material type, width, length, color, UOM, rate.
- Quantity: editable but cannot go below `dispatched` (min = dispatched).
- Delete button: disabled with tooltip "Item has dispatched invoices".
- Attempting to bypass via bulk edit still blocked in save-time validation.

Unlocked items (dispatched = 0) and brand-new rows behave as today.

## Changes

### 1. `src/components/po-form.tsx`
- Accept invoices from the store: `const invoices = useStore(s => s.invoices)`.
- Build `lockedMap = dispatchedByPOItem(invoices)` (only relevant when `existing` is set; for new POs, map is empty).
- Helper `isLocked(itemId)` returns `dispatched > 0` for items that exist in the original PO.
- In the line-items table row:
  - Wrap each editable cell so locked fields render as disabled `Textarea`/`Input`/`Select` (add `disabled` prop + muted styling) with a small lock icon + tooltip on the article cell showing "Dispatched: X — fields locked".
  - Quantity input: set `min={dispatched}`; on change, clamp; show helper text if user tries to go lower.
  - Delete button: `disabled` when locked; tooltip explains why.
- In `validate()` and `save()`:
  - For every original item still present, re-check that immutable fields equal the original values and `quantity >= dispatched`. If not, `toast.error` with the specific item + reason and abort.
  - Detect removed original items that were locked → block with error listing them.

### 2. `src/routes/_authenticated/purchase-orders.$id.edit.tsx`
- Add a subtle banner above the form when any item is locked: "Some items have dispatched invoices and are partially locked." (Computed via the same helper; small util shared with `po-form`.)

### 3. Shared helper
Add `poItemLockInfo(po, invoices)` in `src/lib/reports.ts` (or a small new `src/lib/po-locks.ts`) returning `Map<itemId, { dispatched: number; locked: boolean }>`. Use it in both the form and the edit page banner to avoid duplication.

## Out of scope
- Bulk PO import / `replacePO` path (natural-key diff already preserves IDs; no schema/API changes needed here).
- DB-level trigger enforcement. Client-side guard only, matching the pattern used elsewhere in the app.
