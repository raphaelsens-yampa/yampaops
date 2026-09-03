create or replace function public.campaign_cohort_mrr_by_month(p_campaign_id uuid)
returns table(email_norm text, year_month date, mrr numeric, source text)
language plpgsql
stable
security definer
set search_path = public
as $$
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
      d.mrr as mrr,
      row_number() over (
        partition by em.e, date_trunc('month', d.data_snapshot)
        order by d.data_snapshot desc, d.id desc
      ) as rn
    from public.metas_ativos_pagantes_daily d
    join em on em.e = lower(d.email)
    where d.mrr is not null
  )
  select s.e, s.ym, s.mrr, 'snapshot'::text
  from s
  where s.rn = 1;
end;
$$;

grant execute on function public.campaign_cohort_mrr_by_month(uuid) to authenticated;
grant execute on function public.campaign_cohort_mrr_by_month(uuid) to service_role;