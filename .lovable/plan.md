## Root cause: editing a PO wipes `po_item_id` on existing invoice items

For a manually-created invoice, the form always sets `poItemId` from the selected PO line (`src/components/invoice-form.tsx`, `poItemId: it.id`). So the null didn't come from the create step. It came later, from a **PO update**.

### The mechanism

`docs/invoices.sql` defines:

```sql
po_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL
```

So whenever a `purchase_order_items` row is deleted, every `invoice_items.po_item_id` pointing to it is silently set to `NULL` by Postgres. `po_id` stays, because the parent PO row is untouched.

`src/lib/store.ts` deletes and re-inserts all PO line items on every edit:

```
353:  async updatePO(id, po) {
      ...
367:    const del = await supabase.from("purchase_order_items").delete().eq("po_id", id);
      ...   // then re-insert po.items with brand new UUIDs
```

The bulk PO importer does the same in "update/replace" mode (line 616). Even editing a single field on the PO (delivery date, one line's color, adding a row) causes the whole set of PO items to be deleted and recreated with new UUIDs. All older UUIDs referenced by existing invoices become invalid → the FK fires `SET NULL` on every matching `invoice_items.po_item_id`.

### Why one item on invoice 2026-27/0356 has `po_item_id` and the other doesn't

Most likely sequence:

1. Invoice was created against the PO — both items had `po_item_id` correctly.
2. The PO was edited (or re-imported), which deleted+reinserted its line items with new IDs.
3. Both invoice items got `po_item_id = NULL`.
4. Later, the invoice was edited and one of its rows was re-selected from the current PO → that row got a fresh, valid `po_item_id`. The other row was left as-is → still `NULL`.

Alternate but same-root path: a single PO line was deleted and re-added on the PO (say to fix a color), so only the one item that had linked to the deleted PO line lost its link; the other item's PO line was never touched.

Either way the trigger is: **PO edits (or re-imports) drop and recreate `purchase_order_items` rows, and the FK's `ON DELETE SET NULL` breaks the invoice links.**

### Consequence

- PO-level pendency is still correct — `dispatchedByPO` falls back on `po_id`.
- Item-level pendency (`reports.pendency-item`, PO drill-down) understates dispatched against the specific line that lost its link, because `dispatchedByPOItem` only counts rows with a `po_item_id`.
- Auto-complete of PO status still works (it uses the po-level total via `poFulfillmentStatus`'s "extra" branch), so this bug is largely invisible until you look at per-item balances.

### Fix options (pick one; I'll build after you choose)

- **A. Stop deleting PO items on update (recommended).** Change `store.updatePO` and `bulkImport` "update" mode to diff the items: update existing rows in place, insert new rows, delete only rows the user actually removed. Existing UUIDs are preserved, invoice links stay intact. Most invasive but fixes the class of bug end-to-end.
- **B. Re-link on update.** Keep the delete+reinsert, but before deleting, snapshot the old items, and after inserting the new ones, re-link `invoice_items.po_item_id` by matching on `(article_code, width, length, color)`. Cheaper change, but ambiguous when duplicates exist on the PO and doesn't help if a line was actually deleted.
- **C. Backfill only.** One-off SQL/UI to relink historical `invoice_items` where `po_item_id IS NULL` but `po_id` is set, by matching article/width/length/color to the current PO items. Does not prevent future breakage.
- **D. A + C combined.** Fix the write path and backfill the existing null rows in one go.

### How to confirm on 2026-27/0356 before I change anything

Run in Supabase SQL Editor:

```sql
select ii.id, ii.article_code, ii.width, ii.length, ii.color,
       ii.po_id, ii.po_item_id,
       (select count(*) from purchase_order_items poi
         where poi.po_id = ii.po_id
           and lower(coalesce(poi.article_code,'')) = lower(coalesce(ii.article_code,''))
           and coalesce(poi.width,'')  = coalesce(ii.width,'')
           and coalesce(poi.length,'') = coalesce(ii.length,'')
           and lower(coalesce(poi.color,'')) = lower(coalesce(ii.color,''))
       ) as matching_po_items_now
from invoice_items ii
join invoices i on i.id = ii.invoice_id
where i.invoice_number = '2026-27/0356';
```

If the null-`po_item_id` row shows `matching_po_items_now >= 1`, the PO still has a corresponding line — confirming the link was severed by a PO edit, not by missing data. That result also tells us backfill (option C/D) is safe for this row.

### Note on the Excel-import case (kept for reference, not the cause here)

`src/routes/_authenticated/invoices.import.tsx` → `matchPOItem` only sets `po_item_id` when exactly one PO line matches on article/width/length/color, and silently stores `null` otherwise. Any fix for null links (B/C/D) should also cover imported invoices. Improving import to surface unmatched rows is a separate small change I can bundle in if you want.

No code changes in this plan. Tell me which option (A / B / C / D, and whether to include the import-warning tweak) and I'll implement.