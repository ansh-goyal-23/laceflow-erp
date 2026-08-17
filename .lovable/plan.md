# Sales Returns (Debit Note / Return Challan)

Clients sometimes send back defective material after it has already been invoiced. Today the pendency reports treat every dispatched metre as gone forever, so a returned roll stays hidden and the PO can even sit as Completed. This adds a Sales Return register that puts returned quantity back into pendency.

## What gets built

**New module: Sales Returns**
- Sidebar entry under the dispatch/invoicing area: "Sales Returns".
- List screen: return number, date, client, document type (Debit Note / Return Challan), linked invoice(s), total returned qty, with search, client filter, date range, and CSV/Excel/Print export in the same style as the other registers.
- New / Edit form:
  - Header: return number, return date, client, document type (Debit Note or Return Challan), reference document number, remarks.
  - Line items: pick an invoice of that client, then pick one of its lines — article code, specs, colour and rate auto-fill, and the return qty is capped at what was dispatched on that line (minus what was already returned).
  - Unlinked lines are allowed: choose a PO (or nothing) and type the item details and qty manually, for cases where the original invoice can't be traced.
- Delete a return: reverses its effect on pendency.

**Pendency behaviour**
- Net dispatched = invoiced qty − returned qty, per PO line.
- Pendency (item-wise and PO-wise reports), the PO fulfilment status badge, and the auto-close rule all use the net figure, so a return re-opens pending qty and flips a Completed PO back to Open automatically.
- Returned material must be re-dispatched to close the PO again; the invoice form's "already dispatched" cap also uses the net figure so you can re-invoice the returned quantity.
- Both pendency reports gain a "Returned" column next to Dispatched so the difference is visible.

**Permissions**: same role matrix as invoices — admins edit anything, editors edit what they created, viewers read-only.

## Technical notes

- New migration `docs/sales-returns.sql`: `sales_returns` (header) + `sales_return_items` (lines with nullable `invoice_id`, `invoice_item_id`, `po_id`, `po_item_id`, plus denormalised item spec columns, `return_qty`, `rate`). Includes GRANTs for `authenticated`/`service_role`, RLS enabled, and policies matching the invoices tables. You run the SQL in the Supabase SQL editor.
- `src/lib/store.ts`: add `salesReturns` to store shape, hydrate it, and add add/update/delete actions; `syncPOStatuses` reads net dispatched so returns reopen POs.
- `src/lib/dispatch.ts`: add `returnedByPOItem` / `returnedByPO` and a `netDispatchedByPOItem` helper; existing callers (`reports.ts`, `store.ts`, `invoice-form.tsx`, `po-form.tsx`) switch to the net map.
- `src/lib/reports.ts`: `computePOPendencies` / `computeItemPendencies` / `poItemBreakdown` return `returned` alongside `dispatched`, pending computed from net.
- New routes: `sales-returns.index.tsx`, `sales-returns.new.tsx`, `sales-returns.$id.edit.tsx` under `_authenticated`, plus a shared `sales-return-form.tsx` component mirroring `invoice-form.tsx` (including its double-submit guard).
- Unlinked return lines only affect PO-level pendency when a PO is chosen; with no PO they are recorded for the register and exports only.
