
ALTER TABLE public.pricing_versions DROP CONSTRAINT IF EXISTS pricing_versions_source_check;
ALTER TABLE public.pricing_versions ADD CONSTRAINT pricing_versions_source_check
  CHECK (source = ANY (ARRAY['manual','import','seed','duplicate','edit','revert']));

ALTER TABLE public.pricing_versions DROP CONSTRAINT IF EXISTS pricing_versions_status_check;
ALTER TABLE public.pricing_versions ADD CONSTRAINT pricing_versions_status_check
  CHECK (status = ANY (ARRAY['draft','active','archived','committed']));
