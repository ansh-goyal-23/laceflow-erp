# AI-Powered PO PDF Import Module

A new module that lets users upload a customer PO PDF (digital or scanned), runs it through Lovable AI for extraction, presents a Review screen, saves the PO, and continuously learns from user corrections — with per-client extraction profiles.

## What gets built

### 1. Menu & route
- Add **Import PDF PO** to the Purchase Orders section of the sidebar.
- New route: `/purchase-orders/import-pdf` (uploader + review screen in one flow).
- New route: `/purchase-orders/pdf-import-history` (list of past PDF imports).
- New route: `/ai-learning` (admin dashboard + mapping management).

### 2. Upload & extraction flow
- Single-PDF uploader (drag/drop + click). Accept digital + scanned PDFs (server passes raw PDF to a multimodal model, so scanned pages work via the model's OCR).
- On upload:
  1. PDF sent to a TanStack server function (`extractPoFromPdf`).
  2. Server loads any existing **client extraction profile** + **learned description mappings** to inject as hints into the prompt.
  3. Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with PDF as `file` part + a strict structured-output schema (header + line items + per-field confidence + detected brand/client guesses).
  4. Returns extracted JSON to client.

### 3. Review screen
- Pre-filled PO form (header + editable item rows: article code, lace type, material type, width, length, color, UOM, quantity, rate).
- Each field shows a confidence indicator:
  - High → normal.
  - Medium → amber highlight.
  - Low → amber highlight + ⚠ "Verify this value" tooltip.
- Brand: auto-selected if high confidence; otherwise a "Brand could not be confidently identified" notice + manual picker.
- Client: if matched to existing client → selected. If not → "New Client Detected" card with extracted name/address/GSTIN/phone/email and buttons **Save as New Client** / **Pick Existing Client**.
- Add/delete/edit rows freely before saving.

### 4. Saving & duplicate detection
- On **Save PO**:
  - If `po_number` already exists for that client → modal: **Cancel / Update Existing / Create New Revision** (revision appends `-R2`, `-R3`…).
  - Otherwise create PO + items (reuses existing `store.addPO`).
  - Diff each field against the original AI extraction; every changed field is logged to the learning DB (see §6).

### 5. PDF Import History
- Table: Upload Date, Client, PO Number, File Name, Imported By, Status (extracted / saved / failed).
- Row actions: **View** (reopens review with stored extraction JSON), **Reprocess** (re-runs extraction on the stored PDF), **Delete**.
- File stored in Supabase Storage bucket `po-pdfs`.

### 6. Learning system
- Two scopes of learnings:
  - **Global description mappings** (`description_mappings`): raw description → structured fields, with `confirmations` counter.
  - **Client-specific description mappings** + **client extraction profiles** (`client_extraction_profiles`): per-client overrides, known layouts, date formats, etc.
- Every user correction on the Review screen:
  - Increments confirmations for that mapping (creates if new).
  - Recorded in `learning_audit_log` (client, original value, corrected value, field, user, date).
- Confidence promotion: 1 → low, 5 → medium, 20 → high. High-confidence mappings auto-apply (server merges them into the AI output before returning to client, overriding low-confidence AI guesses).

### 7. AI Learning Dashboard (admin-only)
At `/ai-learning`:
- KPIs: Total PDFs Imported, Total Corrections, Client Profiles, Extraction Accuracy %, Accuracy by Client.
- Most Common Corrections table.
- Client Profiles list → drill into a profile → manage learned rules: **Edit / Delete / Merge / Disable**.
- Audit log viewer with filters.
- Non-admin users see a "Admins only" gate.

## Technical details

### Backend (TanStack server functions in `src/lib/pdf-import.functions.ts`)
- `extractPoFromPdf({ fileBase64, fileName })` — uploads PDF to storage, calls Lovable AI Gateway via AI SDK `generateText` + `Output.object` with a Zod schema covering header, items, confidences, brand/client guesses. Applies high-confidence learned mappings before returning.
- `savePdfImportPO({ extraction, finalPO, importId, mode })` where `mode` is `new | update | revision`. Writes PO, updates import row, diffs fields, writes mappings + audit log.
- `reprocessPdfImport({ importId })`.
- `listPdfImports()` / `deletePdfImport(id)`.
- `learningStats()` / `listMappings({ clientId? })` / `updateMapping` / `deleteMapping` / `mergeMappings` / `toggleMappingEnabled` — all gated by `has_role(_, 'admin')`.

### Storage
- New private bucket `po-pdfs` with RLS: authenticated users can insert/read their own uploads; admins read all.

### Database (new migration)
```
pdf_imports (id, file_path, file_name, client_id, po_id, po_number, status,
             extraction_json, uploaded_by, uploaded_by_email, created_at)
description_mappings (id, client_id NULL, original_text, field, mapped_value,
                      confirmations, enabled, created_at, updated_at)
client_extraction_profiles (id, client_id UNIQUE, layout_notes jsonb,
                            date_formats text[], updated_at)
learning_audit_log (id, client_id, pdf_import_id, field, original_value,
                    corrected_value, user_id, user_email, created_at)
```
All with `GRANT`s + RLS: authenticated read on mappings/profiles, write via security-definer functions; audit log insert by service role inside server fns; admin policies via existing `has_role`.

### AI
- Model: `google/gemini-3-flash-preview` (multimodal, accepts PDF input). Uses AI SDK provider helper already established in `src/lib/ai-gateway.server.ts` (create if missing).
- Structured output via `Output.object` with compact Zod schema; line-item array kept under Gemini's state limit by avoiding long enums.
- Lovable AI requires `LOVABLE_API_KEY` (auto-provisioned).

### Frontend
- `src/routes/_authenticated/purchase-orders.import-pdf.tsx` — uploader + review flow (single page, two visual phases).
- `src/components/pdf-po-review.tsx` — reusable review form with confidence highlighting.
- `src/routes/_authenticated/purchase-orders.pdf-import-history.tsx`.
- `src/routes/_authenticated/ai-learning.tsx` (admin-gated).
- Sidebar updated (`src/components/app-sidebar.tsx`).

### Out of scope (for this iteration)
- Bulk multi-PDF upload.
- Email-to-import.
- Public sharing of mappings across workspaces.

## Prerequisites you'll need to confirm
1. **Lovable Cloud / Supabase** is required (new tables, storage bucket, AI key). It looks enabled already — I'll create the migration + bucket as part of the work.
2. **Lovable AI** will be used for extraction (billed from workspace credits per request).

Reply **go** to build it, or tell me anything to change (e.g. skip the AI Learning Dashboard for v1, or use a different model).
