UPDATE public.ac_funnel_stage_events SET from_stage_id = COALESCE(from_stage_id,''), to_stage_id = COALESCE(to_stage_id,'');
ALTER TABLE public.ac_funnel_stage_events
  ALTER COLUMN from_stage_id SET DEFAULT '',
  ALTER COLUMN to_stage_id SET DEFAULT '';
UPDATE public.ac_funnel_stage_events SET from_stage_id='' WHERE from_stage_id IS NULL;
ALTER TABLE public.ac_funnel_stage_events
  ALTER COLUMN from_stage_id SET NOT NULL,
  ALTER COLUMN to_stage_id SET NOT NULL;
DROP INDEX IF EXISTS public.uq_ac_funnel_stage_events;
CREATE UNIQUE INDEX uq_ac_funnel_stage_events ON public.ac_funnel_stage_events(ac_deal_id, event_type, from_stage_id, to_stage_id, occurred_at);