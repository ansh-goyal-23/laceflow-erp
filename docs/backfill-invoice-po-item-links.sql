-- Backfill invoice_items.po_item_id for rows where the link was severed by a
-- previous PO edit/re-import (FK was ON DELETE SET NULL when the parent
-- purchase_order_items row was replaced).
--
-- Strategy: for each invoice_items row with po_item_id IS NULL but po_id set,
-- find a purchase_order_items row on the same PO whose article/width/length/color
-- match (case-insensitive, trimmed). Only relink when exactly one candidate exists
-- so we never guess between duplicates on the same PO.
--
-- Safe to re-run.

WITH candidates AS (
  SELECT
    ii.id AS invoice_item_id,
    poi.id AS po_item_id,
    COUNT(*) OVER (PARTITION BY ii.id) AS match_count
  FROM public.invoice_items ii
  JOIN public.purchase_order_items poi
    ON poi.po_id = ii.po_id
   AND lower(btrim(coalesce(poi.article_code, ''))) = lower(btrim(coalesce(ii.article_code, '')))
   AND btrim(coalesce(poi.width,  '')) = btrim(coalesce(ii.width,  ''))
   AND btrim(coalesce(poi.length, '')) = btrim(coalesce(ii.length, ''))
   AND lower(btrim(coalesce(poi.color,   ''))) = lower(btrim(coalesce(ii.color,   '')))
  WHERE ii.po_item_id IS NULL
    AND ii.po_id IS NOT NULL
)
UPDATE public.invoice_items ii
SET po_item_id = c.po_item_id
FROM candidates c
WHERE ii.id = c.invoice_item_id
  AND c.match_count = 1;

-- Inspect anything still unlinked (duplicates on the PO, or PO line truly removed):
-- SELECT ii.id, i.invoice_number, ii.po_id, ii.article_code, ii.width, ii.length, ii.color
-- FROM public.invoice_items ii
-- JOIN public.invoices i ON i.id = ii.invoice_id
-- WHERE ii.po_item_id IS NULL AND ii.po_id IS NOT NULL;