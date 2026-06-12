-- Run this in the Supabase SQL Editor to enable the AI-Powered PDF PO Import module.

-- ============ Storage bucket for uploaded PDFs ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('po-pdfs', 'po-pdfs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "po-pdfs read" ON storage.objects;
CREATE POLICY "po-pdfs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'po-pdfs');
DROP POLICY IF EXISTS "po-pdfs insert" ON storage.objects;
CREATE POLICY "po-pdfs insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'po-pdfs');
DROP POLICY IF EXISTS "po-pdfs delete own/admin" ON storage.objects;
CREATE POLICY "po-pdfs delete own/admin" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'po-pdfs' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));

-- ============ PDF imports ============
CREATE TABLE IF NOT EXISTS public.pdf_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text NOT NULL,
  file_name text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  po_number text,
  status text NOT NULL DEFAULT 'extracted',
  extraction_json jsonb,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pdf_imports_client_idx ON public.pdf_imports(client_id);
CREATE INDEX IF NOT EXISTS pdf_imports_created_idx ON public.pdf_imports(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdf_imports TO authenticated;
GRANT ALL ON public.pdf_imports TO service_role;

ALTER TABLE public.pdf_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pdf_imports select" ON public.pdf_imports;
CREATE POLICY "pdf_imports select" ON public.pdf_imports FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pdf_imports insert" ON public.pdf_imports;
CREATE POLICY "pdf_imports insert" ON public.pdf_imports FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "pdf_imports update own/admin" ON public.pdf_imports;
CREATE POLICY "pdf_imports update own/admin" ON public.pdf_imports FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "pdf_imports delete own/admin" ON public.pdf_imports;
CREATE POLICY "pdf_imports delete own/admin" ON public.pdf_imports FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ Description / value mappings (learning DB) ============
CREATE TABLE IF NOT EXISTS public.description_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  field text NOT NULL,
  original_text text NOT NULL,
  mapped_value text NOT NULL,
  confirmations int NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, field, original_text, mapped_value)
);
CREATE INDEX IF NOT EXISTS desc_mappings_lookup_idx
  ON public.description_mappings(field, original_text);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.description_mappings TO authenticated;
GRANT ALL ON public.description_mappings TO service_role;

ALTER TABLE public.description_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "desc_mappings select" ON public.description_mappings;
CREATE POLICY "desc_mappings select" ON public.description_mappings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "desc_mappings insert" ON public.description_mappings;
CREATE POLICY "desc_mappings insert" ON public.description_mappings FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "desc_mappings update" ON public.description_mappings;
CREATE POLICY "desc_mappings update" ON public.description_mappings FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "desc_mappings delete admin" ON public.description_mappings;
CREATE POLICY "desc_mappings delete admin" ON public.description_mappings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ Per-client extraction profile ============
CREATE TABLE IF NOT EXISTS public.client_extraction_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid UNIQUE NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  layout_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  date_formats text[] NOT NULL DEFAULT '{}',
  total_imports int NOT NULL DEFAULT 0,
  total_corrections int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_extraction_profiles TO authenticated;
GRANT ALL ON public.client_extraction_profiles TO service_role;
ALTER TABLE public.client_extraction_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_profiles select" ON public.client_extraction_profiles;
CREATE POLICY "client_profiles select" ON public.client_extraction_profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "client_profiles upsert" ON public.client_extraction_profiles;
CREATE POLICY "client_profiles upsert" ON public.client_extraction_profiles FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "client_profiles update" ON public.client_extraction_profiles;
CREATE POLICY "client_profiles update" ON public.client_extraction_profiles FOR UPDATE TO authenticated USING (true);

-- ============ Learning audit log ============
CREATE TABLE IF NOT EXISTS public.learning_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  pdf_import_id uuid REFERENCES public.pdf_imports(id) ON DELETE SET NULL,
  field text NOT NULL,
  original_value text,
  corrected_value text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.learning_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_client_idx ON public.learning_audit_log(client_id);

GRANT SELECT, INSERT ON public.learning_audit_log TO authenticated;
GRANT ALL ON public.learning_audit_log TO service_role;
ALTER TABLE public.learning_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log select" ON public.learning_audit_log;
CREATE POLICY "audit_log select" ON public.learning_audit_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "audit_log insert" ON public.learning_audit_log;
CREATE POLICY "audit_log insert" ON public.learning_audit_log FOR INSERT TO authenticated WITH CHECK (true);