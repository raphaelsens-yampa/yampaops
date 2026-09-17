-- 1) Eventos órfãos: negócio não existe mais no snapshot do funil
DELETE FROM public.ac_funnel_stage_events e
WHERE NOT EXISTS (
  SELECT 1 FROM public.ac_funnel_deals d
  WHERE d.ac_deal_id = e.ac_deal_id AND d.ac_group_id = e.ac_group_id
);

-- 2) Fechamentos duplicados: mantém o mais próximo da data real de fechamento do negócio
WITH ranked AS (
  SELECT e.id,
         row_number() OVER (
           PARTITION BY e.ac_deal_id, e.event_type
           ORDER BY abs(extract(epoch FROM (e.occurred_at - COALESCE(d.closed_at, e.occurred_at)))) ASC,
                    e.occurred_at ASC
         ) AS rn
  FROM public.ac_funnel_stage_events e
  JOIN public.ac_funnel_deals d
    ON d.ac_deal_id = e.ac_deal_id AND d.ac_group_id = e.ac_group_id
  WHERE e.event_type IN ('won','lost')
)
DELETE FROM public.ac_funnel_stage_events x
USING ranked r
WHERE x.id = r.id AND r.rn > 1;

-- 3) Trava: um fechamento por negócio, tipo e dia
CREATE UNIQUE INDEX IF NOT EXISTS ac_funnel_closure_unique
  ON public.ac_funnel_stage_events (ac_deal_id, event_type, ((occurred_at AT TIME ZONE 'America/Sao_Paulo')::date))
  WHERE event_type IN ('won','lost');