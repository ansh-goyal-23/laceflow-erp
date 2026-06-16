create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

grant select, insert, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;

alter table public.app_settings enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_settings' and policyname='auth read settings') then
    create policy "auth read settings" on public.app_settings
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_settings' and policyname='admin insert settings') then
    create policy "admin insert settings" on public.app_settings
      for insert to authenticated
      with check (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_settings' and policyname='admin update settings') then
    create policy "admin update settings" on public.app_settings
      for update to authenticated
      using (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'))
      with check (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'));
  end if;
end $$;

insert into public.app_settings(key, value)
values ('allow_user_pdf_import', 'false'::jsonb)
on conflict (key) do nothing;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings'
  ) then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end $$;

notify pgrst, 'reload schema';
