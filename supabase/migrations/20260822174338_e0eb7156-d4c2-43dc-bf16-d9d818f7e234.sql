ALTER TABLE public.campaign_history
  ADD COLUMN IF NOT EXISTS theme text,
  ADD COLUMN IF NOT EXISTS workshop_duration text,
  ADD COLUMN IF NOT EXISTS main_offer text,
  ADD COLUMN IF NOT EXISTS downsell_offer text;