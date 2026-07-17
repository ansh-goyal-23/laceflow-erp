-- Yarn Management module schema.
-- Run in the Supabase SQL Editor. Mirrors the client-side store in
-- src/lib/yarn-store.ts (types: YarnSupplier, YarnShade, SampleYarnOrder,
-- SampleYarnOrderItem, SampleYarnReceipt, ProductionYarnOrder,
-- ProductionYarnOrderItem, YarnReceipt, YarnReceiptAllocation, overrides).
--
-- Depends on: public.clients, public.brands, public.purchase_orders,
-- public.purchase_order_items and public.has_role(uuid, app_role).

-- ============================================================================
-- Enums
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.yarn_shade_status AS ENUM ('approved', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.yarn_sample_order_status AS ENUM
    ('draft', 'ordered', 'received', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.yarn_sample_item_approval AS ENUM ('pending', 'approved', 'redye');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.yarn_production_order_status AS ENUM
    ('draft', 'ordered', 'partially_received', 'received', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.yarn_po_item_override AS ENUM ('yarn_not_required');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Suppliers
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.yarn_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text NOT NULL DEFAULT '',
  mobile text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  gst text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS yarn_suppliers_name_idx ON public.yarn_suppliers (lower(name));

-- ============================================================================
-- Shade library
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.yarn_shades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  color_name text NOT NULL,
  material text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.yarn_suppliers(id) ON DELETE RESTRICT,
  supplier_shade_number text NOT NULL,
  approval_date date NOT NULL DEFAULT CURRENT_DATE,
  status public.yarn_shade_status NOT NULL DEFAULT 'approved',
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS yarn_shades_unique_idx
  ON public.yarn_shades (
    client_id, brand_id, supplier_id,
    lower(color_name), lower(material), lower(supplier_shade_number)
  );
CREATE INDEX IF NOT EXISTS yarn_shades_client_idx ON public.yarn_shades (client_id, brand_id);
CREATE INDEX IF NOT EXISTS yarn_shades_supplier_idx ON public.yarn_shades (supplier_id);

-- ============================================================================
-- Sample yarn orders
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.yarn_sample_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_id uuid NOT NULL REFERENCES public.yarn_suppliers(id) ON DELETE RESTRICT,
  linked_po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  remarks text,
  status public.yarn_sample_order_status NOT NULL DEFAULT 'ordered',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS yarn_sample_orders_supplier_idx ON public.yarn_sample_orders (supplier_id);
CREATE INDEX IF NOT EXISTS yarn_sample_orders_po_idx ON public.yarn_sample_orders (linked_po_id);

CREATE TABLE IF NOT EXISTS public.yarn_sample_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.yarn_sample_orders(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  color_name text NOT NULL,
  material text NOT NULL,
  approx_qty numeric NOT NULL DEFAULT 0,
  swatch_url text,
  pantone text,
  remarks text,
  approval_status public.yarn_sample_item_approval NOT NULL DEFAULT 'pending',
  approved_shade_id uuid REFERENCES public.yarn_shades(id) ON DELETE SET NULL,
  approved_at timestamptz,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS yarn_sample_items_order_idx ON public.yarn_sample_order_items (order_id);
CREATE INDEX IF NOT EXISTS yarn_sample_items_shade_idx ON public.yarn_sample_order_items (approved_shade_id);

CREATE TABLE IF NOT EXISTS public.yarn_sample_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.yarn_sample_orders(id) ON DELETE CASCADE,
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_shade_number text NOT NULL,
  lot_number text,
  gross_weight numeric NOT NULL DEFAULT 0,
  cones int NOT NULL DEFAULT 0,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS yarn_sample_receipts_order_idx ON public.yarn_sample_receipts (order_id);

-- ============================================================================
-- Production yarn orders
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.yarn_production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_id uuid NOT NULL REFERENCES public.yarn_suppliers(id) ON DELETE RESTRICT,
  remarks text,
  status public.yarn_production_order_status NOT NULL DEFAULT 'ordered',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS yarn_production_orders_supplier_idx ON public.yarn_production_orders (supplier_id);

CREATE TABLE IF NOT EXISTS public.yarn_production_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.yarn_production_orders(id) ON DELETE CASCADE,
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  po_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  material text NOT NULL,
  color_name text NOT NULL,
  ordered_qty numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  approved_shade_id uuid REFERENCES public.yarn_shades(id) ON DELETE SET NULL,
  supplier_shade_number text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS yarn_prod_items_order_idx ON public.yarn_production_order_items (order_id);
CREATE INDEX IF NOT EXISTS yarn_prod_items_po_idx ON public.yarn_production_order_items (po_id);
CREATE INDEX IF NOT EXISTS yarn_prod_items_po_item_idx ON public.yarn_production_order_items (po_item_id);
CREATE INDEX IF NOT EXISTS yarn_prod_items_shade_lookup_idx
  ON public.yarn_production_order_items (supplier_shade_number);

-- ============================================================================
-- Yarn receipts + allocations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.yarn_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_id uuid NOT NULL REFERENCES public.yarn_suppliers(id) ON DELETE RESTRICT,
  supplier_shade_number text NOT NULL,
  lot_number text,
  gross_weight numeric NOT NULL DEFAULT 0,
  cones int NOT NULL DEFAULT 0,
  unallocated_qty numeric NOT NULL DEFAULT 0,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS yarn_receipts_supplier_idx ON public.yarn_receipts (supplier_id);
CREATE INDEX IF NOT EXISTS yarn_receipts_shade_idx
  ON public.yarn_receipts (supplier_id, supplier_shade_number);

CREATE TABLE IF NOT EXISTS public.yarn_receipt_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.yarn_receipts(id) ON DELETE CASCADE,
  prod_order_item_id uuid NOT NULL REFERENCES public.yarn_production_order_items(id) ON DELETE CASCADE,
  qty numeric NOT NULL CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS yarn_alloc_receipt_idx ON public.yarn_receipt_allocations (receipt_id);
CREATE INDEX IF NOT EXISTS yarn_alloc_item_idx ON public.yarn_receipt_allocations (prod_order_item_id);

-- ============================================================================
-- Per-PO-item procurement overrides ("Yarn Not Required")
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.yarn_po_item_overrides (
  po_item_id uuid PRIMARY KEY REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
  override public.yarn_po_item_override NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================================================
-- created_by triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_yarn_created_by()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'yarn_suppliers','yarn_shades','yarn_sample_orders',
    'yarn_production_orders','yarn_receipts','yarn_po_item_overrides'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_created_by ON public.%1$s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_created_by BEFORE INSERT ON public.%1$s
       FOR EACH ROW EXECUTE FUNCTION public.set_yarn_created_by()', t);
  END LOOP;
END $$;

-- ============================================================================
-- Grants
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_shades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_sample_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_sample_order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_sample_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_production_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_production_order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_receipt_allocations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_po_item_overrides TO authenticated;

GRANT ALL ON public.yarn_suppliers, public.yarn_shades,
  public.yarn_sample_orders, public.yarn_sample_order_items, public.yarn_sample_receipts,
  public.yarn_production_orders, public.yarn_production_order_items,
  public.yarn_receipts, public.yarn_receipt_allocations,
  public.yarn_po_item_overrides
  TO service_role;

-- ============================================================================
-- RLS — signed-in users read all, write own or admin
-- ============================================================================

ALTER TABLE public.yarn_suppliers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yarn_shades                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yarn_sample_orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yarn_sample_order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yarn_sample_receipts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yarn_production_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yarn_production_order_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yarn_receipts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yarn_receipt_allocations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yarn_po_item_overrides       ENABLE ROW LEVEL SECURITY;

-- Tables that carry created_by directly.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'yarn_suppliers','yarn_shades','yarn_sample_orders',
    'yarn_production_orders','yarn_receipts','yarn_po_item_overrides'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s select" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s select" ON public.%1$s
                    FOR SELECT TO authenticated USING (true)', t);

    EXECUTE format('DROP POLICY IF EXISTS "%1$s insert" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s insert" ON public.%1$s
                    FOR INSERT TO authenticated WITH CHECK (true)', t);

    EXECUTE format('DROP POLICY IF EXISTS "%1$s update own/admin" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s update own/admin" ON public.%1$s
                    FOR UPDATE TO authenticated
                    USING (created_by = auth.uid() OR public.has_role(auth.uid(), ''admin''))', t);

    EXECUTE format('DROP POLICY IF EXISTS "%1$s delete own/admin" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s delete own/admin" ON public.%1$s
                    FOR DELETE TO authenticated
                    USING (created_by = auth.uid() OR public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;

-- Child tables — gate through parent order's created_by.
DROP POLICY IF EXISTS "sample_items rw via parent" ON public.yarn_sample_order_items;
CREATE POLICY "sample_items select" ON public.yarn_sample_order_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sample_items write via parent" ON public.yarn_sample_order_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.yarn_sample_orders o
                  WHERE o.id = order_id
                    AND (o.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.yarn_sample_orders o
                       WHERE o.id = order_id
                         AND (o.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE POLICY "sample_receipts select" ON public.yarn_sample_receipts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sample_receipts write via parent" ON public.yarn_sample_receipts
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "prod_items select" ON public.yarn_production_order_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "prod_items write via parent" ON public.yarn_production_order_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.yarn_production_orders o
                  WHERE o.id = order_id
                    AND (o.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.yarn_production_orders o
                       WHERE o.id = order_id
                         AND (o.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE POLICY "receipt_alloc select" ON public.yarn_receipt_allocations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "receipt_alloc write via parent" ON public.yarn_receipt_allocations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.yarn_receipts r
                  WHERE r.id = receipt_id
                    AND (r.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.yarn_receipts r
                       WHERE r.id = receipt_id
                         AND (r.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- ============================================================================
-- Storage bucket for sample swatch uploads (idempotent)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('yarn-swatches', 'yarn-swatches', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "yarn-swatches public read" ON storage.objects;
CREATE POLICY "yarn-swatches public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'yarn-swatches');

DROP POLICY IF EXISTS "yarn-swatches auth write" ON storage.objects;
CREATE POLICY "yarn-swatches auth write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'yarn-swatches');

DROP POLICY IF EXISTS "yarn-swatches auth update" ON storage.objects;
CREATE POLICY "yarn-swatches auth update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'yarn-swatches');

DROP POLICY IF EXISTS "yarn-swatches auth delete" ON storage.objects;
CREATE POLICY "yarn-swatches auth delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'yarn-swatches');