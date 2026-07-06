# Yarn Module → Supabase

This is a large refactor (~11 files, sync → async). Confirming the shape before I execute.

## Prerequisite

You've run `docs/yarn-management.sql` in Supabase (tables, RLS, `yarn-swatches` bucket exist).

## Approach

Keep the **same public API surface** in `src/lib/yarn-store.ts` so route files change minimally:

- `useYarnStore(sel)` stays as a selector hook, but it now reads from a **React Query-backed cache** that fetches all yarn tables once per session (Suppliers, Shades, Sample Orders + items + receipts, Production Orders + items, Receipts + allocations, Overrides). Small dataset → single "yarn-bundle" query is fine and keeps selector semantics.
- `yarnStore.addX / updateX / deleteX` become **async** and go through `supabase.from(...)`. Each writes, then calls `queryClient.invalidateQueries(['yarn'])`.
- Callers get `await`ed at each call site (~30 call sites across 11 route files). Toast/nav happens after `await`.

## Data mapping

Snake_case DB ↔ camelCase TS via a thin mapper module (`src/lib/yarn/mappers.ts`). One mapper per entity, kept trivial (no business logic).

## Complex bits preserved as-is

- **`planYarnReceipt`** (auto vs manual allocation) — runs in JS after fetching current production items for the shade; on commit, `INSERT` receipt + allocations in a single RPC-free sequence, then bumps `received_qty` on affected items in one `update` per row. Wrapped so partial failure surfaces via toast.
- **`ensureShade`** — checks cache first, otherwise `INSERT ... ON CONFLICT DO UPDATE` against the unique index the migration already creates.
- **Procurement stage functions** (`calculateProcurementStage`, `poOverallStage`, `poItemStage`) — unchanged; they operate on the in-memory `StoreShape`, which the cache still provides.
- **Order numbering (`SYO-YYYY-####`, `PYO-YYYY-####`)** — kept client-side against the cached list. Racy under concurrent users; acceptable given single-tenant usage. Note: switch to a DB sequence later if needed.
- **`created_by` / `id` / `created_at`** — set by DB defaults + the trigger from the migration; TS no longer generates UUIDs.

## Auth guard

All queries assume a signed-in Supabase session (already enforced by `_authenticated` layout). No public routes access yarn tables.

## Files

- **Rewrite:** `src/lib/yarn-store.ts` (Query-backed, async writes, same exports).
- **Add:** `src/lib/yarn/mappers.ts`.
- **Edit:** all 10 yarn route files — add `await` on writes, small loading/error states where a mutation blocks navigation. No UI redesign.
- **Delete:** `localStorage` key `shreelace.yarn.v1` reads (kept as a one-time migration import? see below).

## Optional one-time import (recommend YES)

On first mount, if `localStorage['shreelace.yarn.v1']` exists and Supabase tables are empty for this user, offer a "Import local data" toast → uploads suppliers → shades → orders → receipts, then deletes the key. Prevents users losing what's in their browser. Say the word if you want this — otherwise I skip it and old localStorage data is orphaned.

## Out of scope

- Realtime subscriptions (relies on `queryClient.invalidate` after mutations).
- Swatch upload to `yarn-swatches` bucket — current UI already stores `swatchUrl` string; keep as-is (users paste URLs). If you want file uploads, that's a follow-up.
- Server-side stage cache table (`procurement_stage_cache` from the plan wasn't in the migration; stage stays computed on the client).

Confirm and I'll execute in one pass. Include a note if you want the one-time localStorage import.
