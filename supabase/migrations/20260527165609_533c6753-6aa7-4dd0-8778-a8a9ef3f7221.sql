
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS ac_stage_changed_at timestamptz;

ALTER TABLE public.sales_campaign_contacts
  ADD COLUMN IF NOT EXISTS ac_last_stage text,
  ADD COLUMN IF NOT EXISTS ac_last_stage_at timestamptz,
  ADD COLUMN IF NOT EXISTS ac_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS matched_ac_deal_id text;

CREATE INDEX IF NOT EXISTS idx_scc_matched_ac_deal_id
  ON public.sales_campaign_contacts(campaign_id, matched_ac_deal_id);
