-- Fix: allow any authenticated user to write to yarn_sample_receipts.
-- Yarn Inward can be recorded by a user who did not create the sample order
-- (e.g. Store dept records inward for a sample order created by Procurement).
-- The previous policy restricted writes to the sample order's creator, causing
-- "new row violates row-level security policy for table yarn_sample_receipts"
-- and leaving the inward row unlinked (no color / type assigned).

DROP POLICY IF EXISTS "sample_receipts write via parent" ON public.yarn_sample_receipts;
CREATE POLICY "sample_receipts write" ON public.yarn_sample_receipts
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);