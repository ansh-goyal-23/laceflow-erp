-- Yarn Inward workflow — replaces old `yarn_receipts` / `yarn_receipt_allocations`.
-- Run AFTER docs/yarn-management.sql.

-- ---------------------------------------------------------------------------
-- Suppliers gain a default paper-tube weight per cone (editable per row later)
-- ---------------------------------------------------------------------------

ALTER TABLE public.yarn_suppliers
  ADD COLUMN IF NOT EXISTS default_paper_tube_weight numeric NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Drop old single-shade receipts model (Store dept no longer allocates)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.yarn_receipt_allocations CASCADE;
DROP TABLE IF EXISTS public.yarn_receipts CASCADE;

-- ---------------------------------------------------------------------------
-- Yarn Inwards (header) — recorded by Store dept, multiple items per doc
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yarn_inwards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  inward_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_id uuid NOT NULL REFERENCES public.yarn_suppliers(id) ON DELETE RESTRICT,
  supplier_challan_number text NOT NULL DEFAULT '',
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS yarn_inwards_supplier_idx ON public.yarn_inwards (supplier_id);
CREATE INDEX IF NOT EXISTS yarn_inwards_date_idx     ON public.yarn_inwards (inward_date);

-- ---------------------------------------------------------------------------
-- Yarn Inward Items (lines)
-- Net Yarn Weight = gross_weight − (cones × paper_tube_weight)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yarn_inward_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inward_id uuid NOT NULL REFERENCES public.yarn_inwards(id) ON DELETE CASCADE,
  supplier_shade_number text NOT NULL,
  lot_number text,
  gross_weight numeric NOT NULL DEFAULT 0,
  cones int NOT NULL DEFAULT 0,
  paper_tube_weight numeric NOT NULL DEFAULT 0,
  net_weight numeric NOT NULL DEFAULT 0,
  remarks text,
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS yarn_inward_items_inward_idx ON public.yarn_inward_items (inward_id);
CREATE INDEX IF NOT EXISTS yarn_inward_items_shade_idx  ON public.yarn_inward_items (supplier_shade_number);

-- ---------------------------------------------------------------------------
-- Yarn Inward Allocations (procurement-decided, in Net kg)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yarn_inward_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inward_item_id uuid NOT NULL REFERENCES public.yarn_inward_items(id) ON DELETE CASCADE,
  prod_order_item_id uuid NOT NULL REFERENCES public.yarn_production_order_items(id) ON DELETE CASCADE,
  qty numeric NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS yarn_inward_alloc_item_idx     ON public.yarn_inward_allocations (inward_item_id);
CREATE INDEX IF NOT EXISTS yarn_inward_alloc_prod_idx     ON public.yarn_inward_allocations (prod_order_item_id);

-- ---------------------------------------------------------------------------
-- created_by trigger for the new header
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_yarn_inwards_created_by ON public.yarn_inwards;
CREATE TRIGGER trg_yarn_inwards_created_by BEFORE INSERT ON public.yarn_inwards
FOR EACH ROW EXECUTE FUNCTION public.set_yarn_created_by();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_inwards             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_inward_items        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_inward_allocations  TO authenticated;
GRANT ALL ON public.yarn_inwards, public.yarn_inward_items, public.yarn_inward_allocations TO service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.yarn_inwards             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yarn_inward_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yarn_inward_allocations  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "yarn_inwards select" ON public.yarn_inwards;
CREATE POLICY "yarn_inwards select" ON public.yarn_inwards
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "yarn_inwards insert" ON public.yarn_inwards;
CREATE POLICY "yarn_inwards insert" ON public.yarn_inwards
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "yarn_inwards update own/admin" ON public.yarn_inwards;
CREATE POLICY "yarn_inwards update own/admin" ON public.yarn_inwards
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "yarn_inwards delete own/admin" ON public.yarn_inwards;
CREATE POLICY "yarn_inwards delete own/admin" ON public.yarn_inwards
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "yarn_inward_items select" ON public.yarn_inward_items;
CREATE POLICY "yarn_inward_items select" ON public.yarn_inward_items
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "yarn_inward_items write via parent" ON public.yarn_inward_items;
CREATE POLICY "yarn_inward_items write via parent" ON public.yarn_inward_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.yarn_inwards h
                  WHERE h.id = inward_id
                    AND (h.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.yarn_inwards h
                       WHERE h.id = inward_id
                         AND (h.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

DROP POLICY IF EXISTS "yarn_inward_alloc select" ON public.yarn_inward_allocations;
CREATE POLICY "yarn_inward_alloc select" ON public.yarn_inward_allocations
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "yarn_inward_alloc write" ON public.yarn_inward_allocations;
CREATE POLICY "yarn_inward_alloc write" ON public.yarn_inward_allocations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);