-- Nova fonte de métrica tática: movimentação de etapa no ActiveCampaign
ALTER TABLE public.tactical_metrics DROP CONSTRAINT IF EXISTS tactical_metrics_source_check;
ALTER TABLE public.tactical_metrics ADD CONSTRAINT tactical_metrics_source_check
  CHECK (source = ANY (ARRAY['activity_type','stripe_mrr','stripe_deals','stripe_reactivation','manual','ac_stage_move']));

INSERT INTO public.tactical_metrics (key, label, source, unit, is_active, sort_order)
VALUES ('oportunidades_abertas', 'Oportunidades abertas', 'ac_stage_move', 'count', true, 120)
ON CONFLICT (key) DO NOTHING;

-- Configuração do par de etapas que conta como oportunidade aberta
CREATE TABLE IF NOT EXISTS public.ac_stage_move_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL UNIQUE DEFAULT 'oportunidades_abertas',
  ac_group_id text NOT NULL,
  from_stage_id text NOT NULL,
  to_stage_id text NOT NULL,
  start_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ac_stage_move_config TO authenticated;
GRANT ALL ON public.ac_stage_move_config TO service_role;
ALTER TABLE public.ac_stage_move_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read stage move config" ON public.ac_stage_move_config;
CREATE POLICY "read stage move config" ON public.ac_stage_move_config
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admins manage stage move config" ON public.ac_stage_move_config;
CREATE POLICY "admins manage stage move config" ON public.ac_stage_move_config
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.ac_stage_move_config TO authenticated;

-- Mapeamento proprietário AC -> vendedor
CREATE TABLE IF NOT EXISTS public.ac_owner_seller_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ac_group_id text NOT NULL,
  owner_name text NOT NULL,
  seller_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ac_group_id, owner_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ac_owner_seller_map TO authenticated;
GRANT ALL ON public.ac_owner_seller_map TO service_role;
ALTER TABLE public.ac_owner_seller_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read owner map" ON public.ac_owner_seller_map;
CREATE POLICY "read owner map" ON public.ac_owner_seller_map
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admins manage owner map" ON public.ac_owner_seller_map;
CREATE POLICY "admins manage owner map" ON public.ac_owner_seller_map
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_ac_events_stage_change
  ON public.ac_funnel_stage_events (ac_group_id, event_type, occurred_at);