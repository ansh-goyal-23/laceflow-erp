-- Lightweight audit logs (activity tracking only — no field-level history).
do $$ begin
  create type public.audit_action as enum ('CREATE','EDIT','DELETE','IMPORT','LOGIN','LOGOUT');
exception when duplicate_object then null; end $$;

create table if not exists public.audit_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  user_name text not null,
  module text not null,
  action public.audit_action not null,
  record_type text,
  record_id text
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_module_created_idx on public.audit_logs (module, created_at desc);
create index if not exists audit_logs_action_created_idx on public.audit_logs (action, created_at desc);

grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

alter table public.audit_logs enable row level security;

drop policy if exists "admin read audit_logs" on public.audit_logs;
create policy "admin read audit_logs" on public.audit_logs
  for select to authenticated
  using (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'));

create or replace function public.log_activity(
  _module text,
  _action public.audit_action,
  _record_type text default null,
  _record_id text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  uname text;
begin
  if uid is null then return; end if;
  select coalesce(nullif(raw_user_meta_data->>'name',''), email, uid::text)
    into uname
    from auth.users
    where id = uid;
  insert into public.audit_logs(user_id, user_name, module, action, record_type, record_id)
  values (uid, coalesce(uname, uid::text), _module, _action, _record_type, _record_id);
end;
$$;

grant execute on function public.log_activity(text, public.audit_action, text, text) to authenticated;

create or replace function public.audit_known_users()
returns table(user_id uuid, user_name text)
language sql
stable
security definer
set search_path = public
as $$
  select user_id, max(user_name) as user_name
  from public.audit_logs
  where exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
    and user_id is not null
  group by user_id
  order by 2
$$;

grant execute on function public.audit_known_users() to authenticated;
