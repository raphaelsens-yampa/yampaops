ALTER TABLE public.sales_campaign_contacts
  ADD COLUMN IF NOT EXISTS handled_by_ia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS handled_by_human boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ia_source text;

CREATE INDEX IF NOT EXISTS idx_scc_handled_ia
  ON public.sales_campaign_contacts (campaign_id) WHERE handled_by_ia;
CREATE INDEX IF NOT EXISTS idx_scc_handled_human
  ON public.sales_campaign_contacts (campaign_id) WHERE handled_by_human;