CREATE OR REPLACE FUNCTION public.campaign_cohort_mrr_by_month(p_campaign_id uuid)
 RETURNS TABLE(email_norm text, year_month date, mrr numeric, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_tatico_or_admin(auth.uid()) then
    raise exception 'Sem permissão para consultar o cohort';
  end if;

  return query
  with em as (
    select distinct ct.email_norm as e
    from public.campaign_cohort_contacts ct
    where ct.campaign_id = p_campaign_id
  ),
  s as (
    select
      em.e as e,
      date_trunc('month', d.data_snapshot)::date as ym,
      d.data_snapshot as ds,
      d.mrr as mrr,
      lower(coalesce(d.status_assinatura,'')) as st
    from public.metas_ativos_pagantes_daily d
    join em on em.e = lower(d.email)
  ),
  last_day as (
    select s.e, s.ym, max(s.ds) as ds from s group by s.e, s.ym
  ),
  best as (
    select s.e, s.ym,
      max(case when s.st = 'ativo' then coalesce(s.mrr,0) else 0 end) as mrr
    from s join last_day l on l.e = s.e and l.ym = s.ym and l.ds = s.ds
    group by s.e, s.ym
  )
  -- Último snapshot do mês: ativo = MRR líquido do Metabase; cancelado/trial = 0 (não retido)
  select b.e, b.ym, b.mrr, 'snapshot'::text from best b;
end;
$function$;