create table public.commercial_plan_months (
  id uuid primary key default gen_random_uuid(),
  year_month date not null unique,
  target_new_mrr numeric,
  target_churn_mrr numeric,
  target_deals integer,
  target_ativos integer,
  notes text,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.commercial_plan_quotas (
  id uuid primary key default gen_random_uuid(),
  year_month date not null,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  quota_new_mrr numeric not null default 0,
  quota_deals integer not null default 0,
  weight numeric not null default 0,
  is_manual boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year_month, seller_id)
);

grant select on public.commercial_plan_months to authenticated;
grant select, insert, update, delete on public.commercial_plan_months to service_role;
grant select on public.commercial_plan_quotas to authenticated;
grant select, insert, update, delete on public.commercial_plan_quotas to service_role;

alter table public.commercial_plan_months enable row level security;
alter table public.commercial_plan_quotas enable row level security;

create policy "Gestores podem ler o plano"
  on public.commercial_plan_months for select
  to authenticated
  using (public.is_tatico_or_admin(auth.uid()));

create policy "Gestores podem gerenciar o plano"
  on public.commercial_plan_months for all
  to authenticated
  using (public.is_tatico_or_admin(auth.uid()))
  with check (public.is_tatico_or_admin(auth.uid()));

create policy "Gestores podem ler as quotas"
  on public.commercial_plan_quotas for select
  to authenticated
  using (public.is_tatico_or_admin(auth.uid()));

create policy "Gestores podem gerenciar as quotas"
  on public.commercial_plan_quotas for all
  to authenticated
  using (public.is_tatico_or_admin(auth.uid()))
  with check (public.is_tatico_or_admin(auth.uid()));

create trigger update_commercial_plan_months_updated_at
  before update on public.commercial_plan_months
  for each row execute function public.update_updated_at_column();

create trigger update_commercial_plan_quotas_updated_at
  before update on public.commercial_plan_quotas
  for each row execute function public.update_updated_at_column();