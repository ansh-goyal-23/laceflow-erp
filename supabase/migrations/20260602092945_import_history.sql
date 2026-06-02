create table public.po_import_history (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_email text,
  total_rows int not null default 0,
  successful_rows int not null default 0,
  failed_rows int not null default 0,
  pos_created int not null default 0,
  pos_updated int not null default 0,
  line_items_created int not null default 0,
  brands_created int not null default 0,
  clients_created int not null default 0,
  status text not null default 'completed',
  errors jsonb,
  created_at timestamptz not null default now()
);

grant select, insert on public.po_import_history to authenticated;
grant all on public.po_import_history to service_role;

alter table public.po_import_history enable row level security;

create policy "auth read import history" on public.po_import_history for select to authenticated using (true);
create policy "auth insert import history" on public.po_import_history for insert to authenticated with check (true);
