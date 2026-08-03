-- Make "Yarn Not Required" overrides colour-scoped.
--
-- Previously public.yarn_po_item_overrides was keyed by po_item_id alone, so a
-- double-colour lace ("BASE-ARUBA BLUE/LINE-PEACOCK BLUE") could not have yarn
-- marked as not required for one colour only.
--
-- Existing rows keep color_name = '' which the app reads as "all colours of
-- this item", so nothing changes retroactively.

ALTER TABLE public.yarn_po_item_overrides
  ADD COLUMN IF NOT EXISTS color_name text NOT NULL DEFAULT '';

ALTER TABLE public.yarn_po_item_overrides
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

-- Swap the primary key from (po_item_id) to the surrogate id.
DO $$
DECLARE pk text;
BEGIN
  SELECT conname INTO pk
  FROM pg_constraint
  WHERE conrelid = 'public.yarn_po_item_overrides'::regclass AND contype = 'p';

  IF pk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.yarn_po_item_overrides DROP CONSTRAINT %I', pk);
  END IF;
END $$;

ALTER TABLE public.yarn_po_item_overrides
  ADD CONSTRAINT yarn_po_item_overrides_pkey PRIMARY KEY (id);

-- Uniqueness is now per (po_item_id, colour). Plain columns (not an
-- expression index) so ON CONFLICT (po_item_id, color_name) can match it.
CREATE UNIQUE INDEX IF NOT EXISTS yarn_po_item_overrides_item_color_idx
  ON public.yarn_po_item_overrides (po_item_id, color_name);

CREATE INDEX IF NOT EXISTS yarn_po_item_overrides_item_idx
  ON public.yarn_po_item_overrides (po_item_id);

-- Grants / RLS (idempotent re-apply).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_po_item_overrides TO authenticated;
GRANT ALL ON public.yarn_po_item_overrides TO service_role;

ALTER TABLE public.yarn_po_item_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "yarn_po_item_overrides select" ON public.yarn_po_item_overrides;
CREATE POLICY "yarn_po_item_overrides select" ON public.yarn_po_item_overrides
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "yarn_po_item_overrides insert" ON public.yarn_po_item_overrides;
CREATE POLICY "yarn_po_item_overrides insert" ON public.yarn_po_item_overrides
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "yarn_po_item_overrides update own/admin" ON public.yarn_po_item_overrides;
CREATE POLICY "yarn_po_item_overrides update own/admin" ON public.yarn_po_item_overrides
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "yarn_po_item_overrides delete own/admin" ON public.yarn_po_item_overrides;
CREATE POLICY "yarn_po_item_overrides delete own/admin" ON public.yarn_po_item_overrides
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
