-- Sales Returns (Debit Note / Return Challan)
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL,
  return_date date NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  doc_type text NOT NULL DEFAULT 'debit_note',   -- debit_note | return_challan
  reference_number text,
  due_date date,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT sales_returns_client_no_key UNIQUE (client_id, return_number)
);

CREATE TABLE IF NOT EXISTS public.sales_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  invoice_item_id uuid REFERENCES public.invoice_items(id) ON DELETE SET NULL,
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  po_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  po_number text,
  invoice_number text,
  article_code text,
  lace_type text,
  material_type text,
  width text,
  length text,
  color text,
  uom text NOT NULL DEFAULT 'Mtr',
  return_qty numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  settled boolean NOT NULL DEFAULT false,
  settled_qty numeric NOT NULL DEFAULT 0,
  reason text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_return_items_return_id_idx ON public.sales_return_items(return_id);
CREATE INDEX IF NOT EXISTS sales_return_items_po_item_id_idx ON public.sales_return_items(po_item_id);
CREATE INDEX IF NOT EXISTS sales_return_items_po_id_idx ON public.sales_return_items(po_id);
CREATE INDEX IF NOT EXISTS sales_returns_client_id_idx ON public.sales_returns(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_returns TO authenticated;
GRANT ALL ON public.sales_returns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_return_items TO authenticated;
GRANT ALL ON public.sales_return_items TO service_role;

CREATE OR REPLACE FUNCTION public.set_sales_return_created_by()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_returns_created_by ON public.sales_returns;
CREATE TRIGGER trg_sales_returns_created_by BEFORE INSERT ON public.sales_returns
FOR EACH ROW EXECUTE FUNCTION public.set_sales_return_created_by();

ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SalesReturns select" ON public.sales_returns;
CREATE POLICY "SalesReturns select" ON public.sales_returns FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "SalesReturns insert" ON public.sales_returns;
CREATE POLICY "SalesReturns insert" ON public.sales_returns FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "SalesReturns update own/admin" ON public.sales_returns;
CREATE POLICY "SalesReturns update own/admin" ON public.sales_returns FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "SalesReturns delete own/admin" ON public.sales_returns;
CREATE POLICY "SalesReturns delete own/admin" ON public.sales_returns FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "SalesReturnItems select" ON public.sales_return_items;
CREATE POLICY "SalesReturnItems select" ON public.sales_return_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "SalesReturnItems insert via parent" ON public.sales_return_items;
CREATE POLICY "SalesReturnItems insert via parent" ON public.sales_return_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales_returns r WHERE r.id = return_id
    AND (r.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
DROP POLICY IF EXISTS "SalesReturnItems update via parent" ON public.sales_return_items;
CREATE POLICY "SalesReturnItems update via parent" ON public.sales_return_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_returns r WHERE r.id = return_id
    AND (r.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
DROP POLICY IF EXISTS "SalesReturnItems delete via parent" ON public.sales_return_items;
CREATE POLICY "SalesReturnItems delete via parent" ON public.sales_return_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_returns r WHERE r.id = return_id
    AND (r.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
