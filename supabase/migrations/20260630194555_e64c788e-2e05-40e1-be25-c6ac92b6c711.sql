
-- Allow anonymous (public) read access to pricing catalog and proposal templates
-- so the public Gerador de Propostas link works without login.
GRANT SELECT ON public.pricing_versions TO anon;
GRANT SELECT ON public.proposal_templates TO anon;

CREATE POLICY "Public can view pricing versions"
ON public.pricing_versions FOR SELECT TO anon USING (true);

CREATE POLICY "Public can view proposal templates"
ON public.proposal_templates FOR SELECT TO anon USING (true);
