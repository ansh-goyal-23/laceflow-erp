create table public.app_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

grant select, insert, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;

alter table public.app_settings enable row level security;

create policy "auth read settings" on public.app_settings
  for select to authenticated using (true);

create policy "admin insert settings" on public.app_settings
  for insert to authenticated
  with check (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'));

create policy "admin update settings" on public.app_settings
  for update to authenticated
  using (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'));

insert into public.app_settings(key, value)
values ('allow_user_pdf_import', 'false'::jsonb)
on conflict (key) do nothing;

alter publication supabase_realtime add table public.app_settings;
