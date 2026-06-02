-- Run this in Supabase SQL Editor to enable the Dispatch & Invoice module.

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  dispatch_date date NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT invoices_client_invno_key UNIQUE (client_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  po_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  po_number text,
  article_code text,
  lace_type text,
  material_type text,
  width text,
  length text,
  color text,
  uom text NOT NULL DEFAULT 'Mtr',
  dispatch_qty numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_items_po_id_idx ON public.invoice_items(po_id);
CREATE INDEX IF NOT EXISTS invoice_items_po_item_id_idx ON public.invoice_items(po_item_id);
CREATE INDEX IF NOT EXISTS invoices_client_id_idx ON public.invoices(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;

CREATE OR REPLACE FUNCTION public.set_invoice_created_by()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_created_by ON public.invoices;
CREATE TRIGGER trg_invoices_created_by BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.set_invoice_created_by();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoices select" ON public.invoices;
CREATE POLICY "Invoices select" ON public.invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Invoices insert" ON public.invoices;
CREATE POLICY "Invoices insert" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Invoices update own/admin" ON public.invoices;
CREATE POLICY "Invoices update own/admin" ON public.invoices FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Invoices delete own/admin" ON public.invoices;
CREATE POLICY "Invoices delete own/admin" ON public.invoices FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "InvoiceItems select" ON public.invoice_items;
CREATE POLICY "InvoiceItems select" ON public.invoice_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "InvoiceItems insert via parent" ON public.invoice_items;
CREATE POLICY "InvoiceItems insert via parent" ON public.invoice_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
    AND (i.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
DROP POLICY IF EXISTS "InvoiceItems update via parent" ON public.invoice_items;
CREATE POLICY "InvoiceItems update via parent" ON public.invoice_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
    AND (i.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
DROP POLICY IF EXISTS "InvoiceItems delete via parent" ON public.invoice_items;
CREATE POLICY "InvoiceItems delete via parent" ON public.invoice_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
    AND (i.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));