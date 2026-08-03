## Goal

1. Undo a mistaken Approve/Redye from the Sample Yarn Order detail page — including reverting the shade that approval created in the Shade Library, with warnings if that shade is referenced elsewhere.
2. Show a Sample Yarn Order as **Approved** on the list page once every item in it is approved.

## 1. Undo approve / redye (with shade revert)

**Store (`src/lib/yarn-store.ts`)**
- Add `sampleItemUndoInfo(orderId, itemId)` — a read-only helper returning:
  - the shade linked via `approvedShadeId`
  - whether that shade was created by this approval or pre-existed (matched by `ensureShade`'s key: client + brand + color + material + supplier + supplier shade #)
  - a list of other references to that shade: other sample order items and production order items whose `approved_shade_id` points at it (both tables carry that column)
- Add `revertSampleItemApproval(orderId, itemId, { deleteShade })`:
  - set the item's `approval_status = 'pending'`, clear `approved_shade_id` and `approved_at`
  - if `deleteShade` and no other rows reference the shade → delete it from `yarn_shades`
  - if other references exist → never delete; leave the shade intact
  - refresh state
- Redye undo simply resets `approval_status` to `pending` (no shade involved).

**Detail page (`src/routes/_authenticated/yarn.sample-orders.$id.index.tsx`)**
- Next to the Approval badge, show an **Undo** button for items whose status is `approved` or `redye`.
- Clicking opens a confirm dialog that, for approved items, states what will happen to the shade:
  - shade unreferenced → "Shade `<supplier shade #>` will be removed from the Shade Library."
  - shade referenced elsewhere → warning listing the referencing orders: "Shade `<...>` is used by PYO-0012, SYO-0007 and will be kept."
- On confirm, call the store fn and toast the outcome; the item reappears in the Approvals Needed queue.

## 2. Order status reflects full approval

**Shared helper in `src/lib/yarn-store.ts`** — `sampleOrderDisplayStatus(order)`:
- all items `approved` → **Approved**
- stored status `received` with any item `pending` → **Approval Needed**
- any item `redye`, none pending → **Redye Pending**
- otherwise the existing label (Draft / Ordered / Completed / Cancelled)

Use it in `yarn.sample-orders.index.tsx` (replacing the local `statusLabel`) and in the detail header so both screens agree.

## Technical notes

- No schema change: "Approved" is derived from `yarn_sample_order_items.approval_status`, avoiding a Postgres enum alteration on `yarn_sample_orders.status`.
- Both `yarn_sample_order_items.approved_shade_id` and `yarn_production_order_items.approved_shade_id` are `ON DELETE SET NULL`, so a stray delete would silently unlink other orders — hence the reference check gates deletion rather than relying on the FK.

## Verification

- Approve all items in an SYO → list badge reads "Approved".
- Undo an approval whose shade is unused → item back to pending, shade gone from the Shade Library.
- Undo an approval whose shade is used by another order → warning names that order, shade retained, item still reverted.
- Undo a redye item → resets to pending and reappears in Approvals Needed.
