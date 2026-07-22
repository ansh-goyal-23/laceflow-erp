-- Production Management module: tracks per-PO production status and per-item completion.
-- Run in Supabase SQL Editor.

create table if not exists public.po_production (
  po_id uuid primary key references public.purchase_orders(id) on delete cascade,
  status text not null default 'waiting'
    check (status in ('waiting','in_production','packed_ready')),
  sent_to_production_at timestamptz,
  packed_at timestamptz,
  sent_by uuid references auth.users(id),
  packed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.po_production_items (
  po_item_id uuid primary key references public.purchase_order_items(id) on delete cascade,
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  status text not null default 'waiting'
    check (status in ('waiting','completed')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists po_production_items_po_id_idx on public.po_production_items(po_id);

grant select, insert, update, delete on public.po_production to authenticated;
grant all on public.po_production to service_role;
grant select, insert, update, delete on public.po_production_items to authenticated;
grant all on public.po_production_items to service_role;

alter table public.po_production enable row level security;
alter table public.po_production_items enable row level security;

drop policy if exists "po_production auth read" on public.po_production;
drop policy if exists "po_production auth insert" on public.po_production;
drop policy if exists "po_production auth update" on public.po_production;
drop policy if exists "po_production auth delete" on public.po_production;
create policy "po_production auth read"   on public.po_production for select to authenticated using (true);
create policy "po_production auth insert" on public.po_production for insert to authenticated with check (true);
create policy "po_production auth update" on public.po_production for update to authenticated using (true) with check (true);
create policy "po_production auth delete" on public.po_production for delete to authenticated using (true);

drop policy if exists "po_production_items auth read" on public.po_production_items;
drop policy if exists "po_production_items auth insert" on public.po_production_items;
drop policy if exists "po_production_items auth update" on public.po_production_items;
drop policy if exists "po_production_items auth delete" on public.po_production_items;
create policy "po_production_items auth read"   on public.po_production_items for select to authenticated using (true);
create policy "po_production_items auth insert" on public.po_production_items for insert to authenticated with check (true);
create policy "po_production_items auth update" on public.po_production_items for update to authenticated using (true) with check (true);
create policy "po_production_items auth delete" on public.po_production_items for delete to authenticated using (true);

notify pgrst, 'reload schema';