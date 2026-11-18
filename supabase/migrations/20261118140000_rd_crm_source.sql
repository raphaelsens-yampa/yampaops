ALTER TABLE public.ac_funnels ADD COLUMN IF NOT EXISTS crm_source text NOT NULL DEFAULT 'activecampaign';
ALTER TABLE public.ac_funnel_deals ADD COLUMN IF NOT EXISTS crm_source text NOT NULL DEFAULT 'activecampaign';
