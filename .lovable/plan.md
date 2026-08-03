## Goal

When a sample is rejected (**redye**), the dyer sends a fresh sample against the *same* sample order. Recording that Yarn Inward must:

1. Auto-link to the redyed item on that order (not create an orphan row),
2. Put the item back into the **Approvals Needed** queue,
3. Leave a permanent, readable history: every sample received (date, shade #, lot, weight) and every decision (approved / redye / undo) with dates, so anyone can later see how many rounds a colour took.

## Current state (verified)

- `yarn.inwards.new.tsx` already matches a sample row to any order item with `approvalStatus !== "approved"`, so a redyed item **is** linked and mirrored into `yarn_sample_receipts` with the `[[soi:<itemId>]]` marker. That part works today.
- The gap: the **Approvals Needed** queue in `yarn.sample-orders.index.tsx` skips any item whose status isn't `pending`, so a redyed item with a brand-new receipt never resurfaces — it stays stuck as "redye".
- The gap: nothing records *when* a redye/approval decision was made (`approved_at` only, set on approve), so no timeline is reconstructible.

## 1. Approval event log (new table)

New file `docs/yarn-sample-timeline.sql` (run manually, like the other yarn migrations):

```
yarn_sample_approval_events
  id, order_id, item_id, event ('received'|'approved'|'redye'|'reverted'),
  shade_id (nullable), supplier_shade_number, lot_number, note,
  created_at, created_by
```
plus grants for `authenticated`/`service_role`, RLS enabled, permissive read + write policies matching the other yarn tables.

## 2. Store changes (`src/lib/yarn-store.ts`)

- Load events in `hydrate()`/`refresh()`, attach to each sample order as `order.events`.
- `addInward`: when a sample row links to an item whose status is `redye`, reset that item to `approval_status = 'pending'` (clear `approved_shade_id`/`approved_at`) so it re-enters the queue; log a `received` event carrying the shade #, lot and receipt date for every mirrored sample receipt.
- `approveSampleItem` → log `approved` (with the shade id it created/reused).
- `redyeSampleItem` → log `redye`.
- `revertSampleItemApproval` (the Undo added earlier) → log `reverted`.
- `deleteInward` → delete the `received` events tied to the removed sample receipts, and if the item was flipped back to pending by that inward, leave it pending (already the safest state).

## 3. UI

**`yarn.sample-orders.index.tsx`** — Approvals Needed queue: keep surfacing `pending` items, which now naturally includes redyed items that received a fresh sample. Add a small "Round 2/3…" indicator derived from the count of `received` events for that item, so approvers know it's a resample.

**`yarn.sample-orders.$id.index.tsx`** —
- Receipts table gains a **Round** column (nth receipt for that item) and an **Outcome** column (approved / redye / awaiting) resolved from the event immediately following that receipt.
- New **Timeline** card below Receipts: one chronological list per item, e.g.
  ```
  ARUBA BLUE (Cotton)
    12 Jul 2026  Sample received — shade AB-114, lot 22       (round 1)
    14 Jul 2026  Re-dye requested
    26 Jul 2026  Sample received — shade AB-119, lot 31       (round 2)
    28 Jul 2026  Approved — added to Shade Library as AB-119
  ```

## Technical notes

- Events are append-only and keyed to `item_id`, so re-dye rounds are countable without touching the existing status enum.
- Existing orders have no events; the timeline falls back to showing receipts alone plus `approved_at` where present, so nothing breaks for historical data.

## Verification

- Redye an item → it leaves the queue. Record a new Yarn Inward for the same colour/supplier → it links to the same SYO, appears as a second receipt, and the item is back in Approvals Needed marked round 2.
- Approve it → timeline shows received → redye → received → approved with dates.
- Delete the second inward → its receipt and `received` event disappear; earlier history stays intact.
