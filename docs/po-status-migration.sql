-- Run this in Supabase SQL Editor:
-- Migrates legacy 'submitted' PO status to the new 'open' status.
UPDATE public.purchase_orders SET status = 'open' WHERE status = 'submitted';