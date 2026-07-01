-- Run in Supabase SQL Editor to enable the Production Status field used by the Reports module.
alter table public.purchase_orders
  add column if not exists production_status text;

notify pgrst, 'reload schema';