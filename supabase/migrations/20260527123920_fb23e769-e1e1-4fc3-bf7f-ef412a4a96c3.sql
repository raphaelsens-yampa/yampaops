
ALTER TABLE public.sales_campaign_contacts
  ADD COLUMN IF NOT EXISTS ops_contacted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ops_contacted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ops_contacted_by uuid,
  ADD COLUMN IF NOT EXISTS ops_notes text;

CREATE INDEX IF NOT EXISTS idx_scc_ops_contacted
  ON public.sales_campaign_contacts (campaign_id, ops_contacted);
