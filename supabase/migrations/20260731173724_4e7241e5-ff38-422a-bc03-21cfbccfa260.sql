ALTER TABLE public.tactical_recoveries
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'recovered';

ALTER TABLE public.tactical_manual_entries
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'recovered';

ALTER TABLE public.tactical_recoveries
  DROP CONSTRAINT IF EXISTS tactical_recoveries_entry_kind_check;
ALTER TABLE public.tactical_recoveries
  ADD CONSTRAINT tactical_recoveries_entry_kind_check CHECK (entry_kind IN ('recovered','retained'));

ALTER TABLE public.tactical_manual_entries
  DROP CONSTRAINT IF EXISTS tactical_manual_entries_entry_kind_check;
ALTER TABLE public.tactical_manual_entries
  ADD CONSTRAINT tactical_manual_entries_entry_kind_check CHECK (entry_kind IN ('recovered','retained'));

INSERT INTO public.tactical_metrics (key, label, source, unit, sort_order, is_active, team_id)
SELECT 'clientes_retidos', 'Clientes retidos', 'manual', 'count', 95, true,
       (SELECT team_id FROM public.tactical_metrics WHERE key = 'clientes_recuperados' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM public.tactical_metrics WHERE key = 'clientes_retidos');