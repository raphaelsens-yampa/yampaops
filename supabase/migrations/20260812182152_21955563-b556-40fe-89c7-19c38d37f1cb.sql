-- 1) Quebra diária dos Novos Pagantes vinda do Metabase
CREATE TABLE public.metas_novos_pagantes_daily (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data date NOT NULL,
  mes_ref text,
  classificacao text NOT NULL,
  vendedor text NOT NULL DEFAULT '—',
  area text NOT NULL DEFAULT '—',
  qtd_mtd integer NOT NULL DEFAULT 0,
  mrr_mtd numeric NOT NULL DEFAULT 0,
  tipo_snapshot text,
  fonte text,
  coletado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.metas_novos_pagantes_daily TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.metas_novos_pagantes_daily TO authenticated;
GRANT ALL ON public.metas_novos_pagantes_daily TO service_role;

ALTER TABLE public.metas_novos_pagantes_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mnpd_select_authenticated"
  ON public.metas_novos_pagantes_daily FOR SELECT TO authenticated USING (true);

CREATE POLICY "mnpd_write_admin"
  ON public.metas_novos_pagantes_daily FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid()))
  WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE UNIQUE INDEX metas_novos_pagantes_daily_uniq
  ON public.metas_novos_pagantes_daily (data, classificacao, vendedor, area);

CREATE INDEX metas_novos_pagantes_daily_data_idx
  ON public.metas_novos_pagantes_daily (data);

CREATE TRIGGER update_metas_novos_pagantes_daily_updated_at
  BEFORE UPDATE ON public.metas_novos_pagantes_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Valor por dia (delta entre snapshots consecutivos do mesmo mês)
CREATE VIEW public.metas_novos_pagantes_delta
WITH (security_invoker = true) AS
SELECT
  d.data,
  d.mes_ref,
  d.classificacao,
  d.vendedor,
  d.area,
  d.qtd_mtd,
  d.mrr_mtd,
  GREATEST(d.qtd_mtd - COALESCE(LAG(d.qtd_mtd) OVER w, 0), 0) AS qtd_dia,
  GREATEST(d.mrr_mtd - COALESCE(LAG(d.mrr_mtd) OVER w, 0), 0) AS mrr_dia,
  d.tipo_snapshot,
  d.fonte
FROM public.metas_novos_pagantes_daily d
WINDOW w AS (
  PARTITION BY d.mes_ref, d.classificacao, d.vendedor, d.area
  ORDER BY d.data
);

GRANT SELECT ON public.metas_novos_pagantes_delta TO authenticated;
GRANT SELECT ON public.metas_novos_pagantes_delta TO service_role;

-- 3) Backup diário do que o Stripe apurou
CREATE TABLE public.tactical_stripe_daily_backup (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data date NOT NULL,
  metric_key text NOT NULL,
  user_id uuid,
  qtd integer NOT NULL DEFAULT 0,
  mrr numeric NOT NULL DEFAULT 0,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tactical_stripe_daily_backup TO authenticated;
GRANT ALL ON public.tactical_stripe_daily_backup TO service_role;

ALTER TABLE public.tactical_stripe_daily_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tsdb_select_authenticated"
  ON public.tactical_stripe_daily_backup FOR SELECT TO authenticated USING (true);

CREATE POLICY "tsdb_write_admin"
  ON public.tactical_stripe_daily_backup FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid()))
  WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE UNIQUE INDEX tactical_stripe_daily_backup_uniq
  ON public.tactical_stripe_daily_backup (data, metric_key, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TRIGGER update_tactical_stripe_daily_backup_updated_at
  BEFORE UPDATE ON public.tactical_stripe_daily_backup
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Overrides explícitos do realizado
CREATE TABLE public.tactical_realized_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data date NOT NULL,
  metric_key text NOT NULL,
  user_id uuid,
  qtd integer NOT NULL DEFAULT 0,
  mrr numeric NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'stripe_backup',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tactical_realized_overrides TO authenticated;
GRANT ALL ON public.tactical_realized_overrides TO service_role;

ALTER TABLE public.tactical_realized_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tro_select_authenticated"
  ON public.tactical_realized_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "tro_write_admin"
  ON public.tactical_realized_overrides FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid()))
  WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE UNIQUE INDEX tactical_realized_overrides_uniq
  ON public.tactical_realized_overrides (data, metric_key, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TRIGGER update_tactical_realized_overrides_updated_at
  BEFORE UPDATE ON public.tactical_realized_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();