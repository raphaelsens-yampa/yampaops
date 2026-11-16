DROP POLICY IF EXISTS "Public can view pricing versions" ON public.pricing_versions;
DROP POLICY IF EXISTS "Public can view proposal templates" ON public.proposal_templates;
REVOKE SELECT ON public.pricing_versions FROM anon;
REVOKE SELECT ON public.proposal_templates FROM anon;