-- ============================================================================
-- Sample approval timeline
-- Append-only log of everything that happens to a sample order item:
-- every physical sample received, and every decision (approve / redye / undo).
-- Lets us reconstruct "how many rounds did this colour take, and when".
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.yarn_sample_event AS ENUM ('received', 'approved', 'redye', 'reverted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.yarn_sample_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.yarn_sample_orders(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.yarn_sample_order_items(id) ON DELETE CASCADE,
  receipt_id uuid REFERENCES public.yarn_sample_receipts(id) ON DELETE CASCADE,
  event public.yarn_sample_event NOT NULL,
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  shade_id uuid REFERENCES public.yarn_shades(id) ON DELETE SET NULL,
  supplier_shade_number text,
  lot_number text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS yarn_sample_events_order_idx ON public.yarn_sample_approval_events (order_id);
CREATE INDEX IF NOT EXISTS yarn_sample_events_item_idx  ON public.yarn_sample_approval_events (item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_sample_approval_events TO authenticated;
GRANT ALL ON public.yarn_sample_approval_events TO service_role;

ALTER TABLE public.yarn_sample_approval_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sample_events select" ON public.yarn_sample_approval_events;
CREATE POLICY "sample_events select" ON public.yarn_sample_approval_events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sample_events write" ON public.yarn_sample_approval_events;
CREATE POLICY "sample_events write" ON public.yarn_sample_approval_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
