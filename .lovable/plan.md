## Problem (verified in code)

`yarn_po_item_overrides` is keyed only by `po_item_id` (`docs/yarn-management.sql:211`), and the store loads it as `overrides[po_item_id]` (`src/lib/yarn-store.ts:509`). The "Mark Yarn Not Required" toggle is rendered inside a colour group but writes against the whole item (`yarn.production-orders.new.tsx:352, 513-527`).

So for a double-colour lace ("BASE-ARUBA BLUE/LINE-PEACOCK BLUE"), marking the base colour as not required also silently marks the line colour, and `poItemStage` short-circuits to `production_pending` for the entire item (`yarn-store.ts:1365`), which is why the statuses look wrong.

## Fix: make the override colour-scoped

**1. Migration (new file `docs/yarn-po-item-color-overrides.sql`)**
- Add `color_name text NOT NULL DEFAULT ''` to `yarn_po_item_overrides`.
- Drop the existing single-column primary key and recreate it as `(po_item_id, lower(color_name))` (unique index + surrogate `id`), keeping the FK cascade to `purchase_order_items`.
- Existing rows keep `color_name = ''`, which is interpreted as "all colours of this item" so nothing changes retroactively; new writes always carry an explicit colour.
- Re-apply grants and the existing RLS policies to the reshaped table.

**2. Store (`src/lib/yarn-store.ts`)**
- Change `overrides` to `Record<string, PoItemOverride>` keyed by `` `${poItemId}::${colorKey}` `` (colour lower-cased/trimmed; legacy blank-colour rows map to the item-wide key `` `${poItemId}::*` ``).
- Add helpers `isColorOverridden(s, poItemId, color)` (true if the exact colour key or the legacy item-wide key exists) and `itemOverriddenColors(s, item)`.
- `setOverride(poItemId, color, override|null)` writes/deletes the colour-scoped row.
- `poItemStage`: skip overridden colours; the item's stage is the least-advanced of the remaining colours; if *every* expanded colour is overridden, return `yarn_not_required`.
- `poOverallStage`: same per-colour skipping instead of skipping whole items.

**3. Procurement UI (`yarn.production-orders.new.tsx`)**
- Move the toggle so it operates on the colour group's colour: `OverrideToggle` takes `poItemId` + `colorName` and shows "Mark Yarn Not Required" / "Clear override" for that colour only.
- Show a small "Yarn Not Required" badge on the colour group header when every item in that group is overridden for that colour, and hide the "Order" button in that state.

**4. Downstream consumers of the override**
- `src/lib/production-store.ts` (`poProgress`, `poRawMaterialSummary`) — exclude an item from progress only when *all* its colours are overridden; exclude individual colour lines from the raw-material summary.
- `src/lib/production-slip.ts` and `src/routes/_authenticated/production.$id.tsx` — the item's "Yarn Not Required" marker becomes per-colour text (e.g. "Yarn Not Required: PEACOCK BLUE") instead of blanking the whole row.

## Notes

The migration must be run in the Supabase SQL editor before the new UI behaves correctly; until then the app reads legacy item-wide rows and keeps working as today.
