ALTER TABLE public.sales_campaign_snapshots
ADD COLUMN IF NOT EXISTS handled_by text NOT NULL DEFAULT 'unspecified'
CHECK (handled_by IN ('unspecified', 'ia', 'human', 'mixed'));