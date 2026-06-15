# Admin Audit Logs & User Activity Tracking

A minimal-storage activity log system for Shree Lace ERP, with three Admin-only screens: Audit Logs, User Activity, and Daily Work Report.

## 1. Database

New migration `supabase/migrations/<ts>_audit_logs.sql`:

```sql
create type public.audit_action as enum ('CREATE','EDIT','DELETE','IMPORT','LOGIN','LOGOUT');

create table public.audit_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null,
  module text not null,            -- e.g. 'Purchase Orders'
  action public.audit_action not null,
  record_type text,                -- e.g. 'PO'
  record_id text                   -- string to fit numeric/uuid identifiers
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_user_idx       on public.audit_logs (user_id, created_at desc);
create index audit_logs_module_idx     on public.audit_logs (module, created_at desc);
create index audit_logs_action_idx     on public.audit_logs (action, created_at desc);

grant select on public.audit_logs to authenticated;       -- gated further by RLS
grant all on public.audit_logs to service_role;

alter table public.audit_logs enable row level security;

create policy "Admins read audit_logs"
  on public.audit_logs for select to authenticated
  using (public.has_role(auth.uid(),'admin'));
-- No insert/update/delete policies → writes only via service_role (server fns).
```

Storage stays minimal: no JSON snapshots, no diff rows, no IP/UA/geo. Indexed only on the columns the screens filter by.

The existing `created_by`, `created_at`, `updated_by`, `updated_at` columns on brands/clients/purchase_orders/po_items/dispatches/invoices remain the source of truth for "who created/edited this record"; we'll surface them on detail pages and not duplicate them in logs.

## 2. Server logging

New `src/lib/audit.functions.ts` (admin client, inside handler):

- `logAudit({ module, action, recordType, recordId })` — `createServerFn` + `requireSupabaseAuth`, resolves the caller's display name from `profiles`, inserts one row via `supabaseAdmin`. Never throws to the caller; on failure it logs server-side only so user flows aren't broken.
- `listAuditLogs({ search, userId, module, action, from, to, limit, offset })` — admin-only (verifies `has_role(..., 'admin')`), returns paginated rows + total.
- `getUserActivity({ from, to, userId })` — admin-only; returns one row per user with counts per action plus `last_activity` (single aggregated SQL query).
- `getDailyWorkReport({ date })` — admin-only; groups by user + module + action for that day.

Call `logAudit` at the end of existing server actions for: brand/client/PO/PO item/dispatch/invoice create/edit/delete, PO import, PDF PO import (on save), AI-learning record changes, user role changes. Login/logout logged from the client (`onAuthStateChange` SIGNED_IN/SIGNED_OUT) via a thin `logAuthEvent` server fn.

## 3. Routes (Admin-only)

All under a new pathless gate `src/routes/_authenticated/_admin.tsx` that calls `has_role` and redirects non-admins to `/`.

- `src/routes/_authenticated/_admin/audit-logs.tsx` — table with Search, User filter, Module filter, Action filter, Date range, pagination, Export (CSV + Excel).
- `src/routes/_authenticated/_admin/user-activity.tsx` — productivity table (Created / Edited / Deleted / Imports / Logins / Last activity), Date range + User filter, Export.
- `src/routes/_authenticated/_admin/daily-work-report.tsx` — date picker, per-user grouped summary, Export.

Sidebar: add an "Admin" group containing the three items, rendered only when `user.role === 'admin'`.

## 4. Record metadata UI

On existing detail pages for Brands / Clients / Purchase Orders / Dispatches / Invoices, add a small "Record info" block showing Created By / Created At / Updated By / Updated At, resolved from `profiles`. No schema changes — columns already exist.

## 5. Export

Reuse the existing xlsx/csv helpers (or `papaparse` + `xlsx` if not present) in a single `src/lib/export-table.ts` used by all three screens.

## Technical notes

- Logs are append-only; no UI to edit/delete them.
- Counts come from aggregate SQL (`count(*) filter (where action = ...)`), not by pulling rows into JS.
- Pagination is server-side; default 50/page.
- Every `logAudit` call is fire-and-forget from the caller's perspective (awaited inside the handler but wrapped in try/catch so a logging failure doesn't break the business action).
- No daily-summary table — reports are computed on demand from `audit_logs`, as requested.
