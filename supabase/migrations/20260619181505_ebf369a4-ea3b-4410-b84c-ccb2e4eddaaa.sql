
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS realized_override numeric(14,2),
  ADD COLUMN IF NOT EXISTS realized_source_note text;
