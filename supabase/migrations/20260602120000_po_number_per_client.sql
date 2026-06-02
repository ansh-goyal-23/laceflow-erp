-- Allow same PO number across different clients; enforce uniqueness per client
ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_po_number_key;

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_client_id_po_number_key;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_client_id_po_number_key
  UNIQUE (client_id, po_number);
