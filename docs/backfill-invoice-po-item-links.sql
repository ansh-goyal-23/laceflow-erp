-- Backfill invoice_items.po_item_id for rows where the link was severed by a
-- previous PO edit/re-import (FK was ON DELETE SET NULL when the parent
-- purchase_order_items row was replaced).
--
-- Safe to re-run.
--
-- Important: if the values look identical in the app but still do not link,
-- the usual causes are:
--   1) duplicate PO item rows with the same article/width/length/color, so the
--      script refuses to guess which item should receive the dispatch; or
--   2) hidden spacing/formatting differences, such as non-breaking spaces,
--      zero-width spaces, repeated spaces, or numeric text like 10 vs 10.00.
-- This script normalizes those same-looking values before matching, but still
-- updates only when exactly one candidate is found.

CREATE OR REPLACE FUNCTION pg_temp.invoice_po_match_text(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    regexp_replace(
      btrim(
        translate(
          replace(
            replace(
              replace(coalesce(value, ''), chr(160), ' '),  -- non-breaking space
              chr(8239), ' '                               -- narrow non-breaking space
            ),
            chr(8203), ''                                  -- zero-width space
          ),
          chr(9) || chr(10) || chr(13),
          '   '
        )
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.invoice_po_match_number(value text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN replace(pg_temp.invoice_po_match_text(value), ',', '') ~ '^[0-9]+(\.[0-9]+)?$'
      THEN replace(pg_temp.invoice_po_match_text(value), ',', '')::numeric
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.invoice_po_match_dimension(left_value text, right_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT pg_temp.invoice_po_match_text(left_value) = pg_temp.invoice_po_match_text(right_value)
    OR (
      pg_temp.invoice_po_match_number(left_value) IS NOT NULL
      AND pg_temp.invoice_po_match_number(right_value) IS NOT NULL
      AND pg_temp.invoice_po_match_number(left_value) = pg_temp.invoice_po_match_number(right_value)
    );
$$;

-- ============================================================
-- PASS 1: normalized exact match on saved po_id.
-- Matches same-looking values even when hidden spaces or numeric formatting
-- differ. Still gated on match_count = 1 to avoid duplicate PO item guesses.
-- ============================================================

WITH candidates AS (
  SELECT
    ii.id AS invoice_item_id,
    poi.id AS po_item_id,
    COUNT(*) OVER (PARTITION BY ii.id) AS match_count
  FROM public.invoice_items ii
  JOIN public.purchase_order_items poi
    ON poi.po_id = ii.po_id
   AND pg_temp.invoice_po_match_text(poi.article_code) = pg_temp.invoice_po_match_text(ii.article_code)
   AND pg_temp.invoice_po_match_dimension(poi.width, ii.width)
   AND pg_temp.invoice_po_match_dimension(poi.length, ii.length)
   AND pg_temp.invoice_po_match_text(poi.color) = pg_temp.invoice_po_match_text(ii.color)
  WHERE ii.po_item_id IS NULL
    AND ii.po_id IS NOT NULL
)
UPDATE public.invoice_items ii
SET po_item_id = c.po_item_id
FROM candidates c
WHERE ii.id = c.invoice_item_id
  AND c.match_count = 1;

-- ============================================================
-- PASS 2: fuzzy color fallback.
--
-- After the color-centric procurement change, some PO items store a combined
-- color like "NEW NAVY / LINE INTENSE RED", while the invoice row's color is
-- just one side, e.g. "INTENSE RED". Exact equality misses those. Match
-- article/width/length exactly and require the PO color to contain the
-- invoice color (or vice versa). Still gated on match_count = 1 so we never
-- guess between duplicates.
-- ============================================================

WITH candidates AS (
  SELECT
    ii.id AS invoice_item_id,
    poi.id AS po_item_id,
    COUNT(*) OVER (PARTITION BY ii.id) AS match_count
  FROM public.invoice_items ii
  JOIN public.purchase_order_items poi
    ON poi.po_id = ii.po_id
   AND pg_temp.invoice_po_match_text(poi.article_code) = pg_temp.invoice_po_match_text(ii.article_code)
   AND pg_temp.invoice_po_match_dimension(poi.width, ii.width)
   AND pg_temp.invoice_po_match_dimension(poi.length, ii.length)
   AND pg_temp.invoice_po_match_text(ii.color) <> ''
   AND pg_temp.invoice_po_match_text(poi.color) <> ''
   AND (
      pg_temp.invoice_po_match_text(poi.color) LIKE '%' || pg_temp.invoice_po_match_text(ii.color) || '%'
      OR pg_temp.invoice_po_match_text(ii.color) LIKE '%' || pg_temp.invoice_po_match_text(poi.color) || '%'
   )
  WHERE ii.po_item_id IS NULL
    AND ii.po_id IS NOT NULL
)
UPDATE public.invoice_items ii
SET po_item_id = c.po_item_id
FROM candidates c
WHERE ii.id = c.invoice_item_id
  AND c.match_count = 1;

-- ============================================================
-- PASS 3: PO-number fallback for stale/missing po_id.
-- If an invoice row has the PO number but po_id is missing/stale, relink through
-- invoices.client_id + purchase_orders.po_number. Still updates only when one
-- unique PO item candidate exists.
-- ============================================================

WITH candidates AS (
  SELECT
    ii.id AS invoice_item_id,
    po.id AS po_id,
    poi.id AS po_item_id,
    COUNT(*) OVER (PARTITION BY ii.id) AS match_count
  FROM public.invoice_items ii
  JOIN public.invoices inv ON inv.id = ii.invoice_id
  JOIN public.purchase_orders po
    ON po.client_id = inv.client_id
   AND pg_temp.invoice_po_match_text(po.po_number) = pg_temp.invoice_po_match_text(ii.po_number)
  JOIN public.purchase_order_items poi
    ON poi.po_id = po.id
   AND pg_temp.invoice_po_match_text(poi.article_code) = pg_temp.invoice_po_match_text(ii.article_code)
   AND pg_temp.invoice_po_match_dimension(poi.width, ii.width)
   AND pg_temp.invoice_po_match_dimension(poi.length, ii.length)
   AND pg_temp.invoice_po_match_text(poi.color) = pg_temp.invoice_po_match_text(ii.color)
  WHERE ii.po_item_id IS NULL
    AND ii.po_number IS NOT NULL
)
UPDATE public.invoice_items ii
SET po_id = c.po_id,
    po_item_id = c.po_item_id
FROM candidates c
WHERE ii.id = c.invoice_item_id
  AND c.match_count = 1;

-- ============================================================
-- FINAL DIAGNOSTIC: rows still unlinked after all safe passes.
-- If full_field_matches_on_saved_po is greater than 1, the reason is duplicate
-- PO item rows with the same matching fields; the script deliberately skips
-- those because assigning one automatically would be a guess.
-- ============================================================

SELECT
  inv.invoice_number,
  ii.po_number,
  ii.po_id,
  ii.article_code,
  ii.width,
  ii.length,
  ii.color,
  ii.dispatch_qty,
  (
    SELECT count(*)
    FROM public.purchase_order_items poi
    WHERE poi.po_id = ii.po_id
  ) AS items_on_saved_po,
  (
    SELECT count(*)
    FROM public.purchase_order_items poi
    WHERE poi.po_id = ii.po_id
      AND pg_temp.invoice_po_match_text(poi.article_code) = pg_temp.invoice_po_match_text(ii.article_code)
  ) AS article_matches_on_saved_po,
  (
    SELECT count(*)
    FROM public.purchase_order_items poi
    WHERE poi.po_id = ii.po_id
      AND pg_temp.invoice_po_match_text(poi.article_code) = pg_temp.invoice_po_match_text(ii.article_code)
      AND pg_temp.invoice_po_match_dimension(poi.width, ii.width)
      AND pg_temp.invoice_po_match_dimension(poi.length, ii.length)
      AND pg_temp.invoice_po_match_text(poi.color) = pg_temp.invoice_po_match_text(ii.color)
  ) AS full_field_matches_on_saved_po,
  (
    SELECT count(*)
    FROM public.purchase_orders po
    JOIN public.purchase_order_items poi ON poi.po_id = po.id
    WHERE po.client_id = inv.client_id
      AND pg_temp.invoice_po_match_text(po.po_number) = pg_temp.invoice_po_match_text(ii.po_number)
      AND pg_temp.invoice_po_match_text(poi.article_code) = pg_temp.invoice_po_match_text(ii.article_code)
      AND pg_temp.invoice_po_match_dimension(poi.width, ii.width)
      AND pg_temp.invoice_po_match_dimension(poi.length, ii.length)
      AND pg_temp.invoice_po_match_text(poi.color) = pg_temp.invoice_po_match_text(ii.color)
  ) AS full_field_matches_by_po_number,
  (
    SELECT string_agg(poi.id::text || ' qty=' || poi.quantity::text, ', ' ORDER BY poi.sort_order, poi.id::text)
    FROM public.purchase_order_items poi
    WHERE poi.po_id = ii.po_id
      AND pg_temp.invoice_po_match_text(poi.article_code) = pg_temp.invoice_po_match_text(ii.article_code)
      AND pg_temp.invoice_po_match_dimension(poi.width, ii.width)
      AND pg_temp.invoice_po_match_dimension(poi.length, ii.length)
      AND pg_temp.invoice_po_match_text(poi.color) = pg_temp.invoice_po_match_text(ii.color)
  ) AS matching_saved_po_item_ids,
  CASE
    WHEN ii.po_id IS NULL THEN 'po_id is null; check full_field_matches_by_po_number'
    WHEN (
      SELECT count(*)
      FROM public.purchase_order_items poi
      WHERE poi.po_id = ii.po_id
        AND pg_temp.invoice_po_match_text(poi.article_code) = pg_temp.invoice_po_match_text(ii.article_code)
        AND pg_temp.invoice_po_match_dimension(poi.width, ii.width)
        AND pg_temp.invoice_po_match_dimension(poi.length, ii.length)
        AND pg_temp.invoice_po_match_text(poi.color) = pg_temp.invoice_po_match_text(ii.color)
    ) > 1 THEN 'duplicate matching PO items; manual choice needed'
    WHEN (
      SELECT count(*)
      FROM public.purchase_order_items poi
      WHERE poi.po_id = ii.po_id
        AND pg_temp.invoice_po_match_text(poi.article_code) = pg_temp.invoice_po_match_text(ii.article_code)
        AND pg_temp.invoice_po_match_dimension(poi.width, ii.width)
        AND pg_temp.invoice_po_match_dimension(poi.length, ii.length)
        AND pg_temp.invoice_po_match_text(poi.color) = pg_temp.invoice_po_match_text(ii.color)
    ) = 0 THEN 'no matching item on saved po_id'
    ELSE 'review row'
  END AS likely_reason
FROM public.invoice_items ii
JOIN public.invoices inv ON inv.id = ii.invoice_id
WHERE ii.po_item_id IS NULL
  AND (ii.po_id IS NOT NULL OR ii.po_number IS NOT NULL)
ORDER BY inv.invoice_number, ii.po_number, ii.article_code, ii.color;
