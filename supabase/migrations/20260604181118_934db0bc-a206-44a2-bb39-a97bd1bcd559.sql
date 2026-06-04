
ALTER TABLE public.pricing_versions ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.pricing_versions ADD COLUMN IF NOT EXISTS change_type text;

CREATE POLICY "Authenticated can create pricing versions"
ON public.pricing_versions
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());
