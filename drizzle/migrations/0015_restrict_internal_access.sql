CREATE OR REPLACE FUNCTION public.is_internal_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _user_id
      AND u.email_confirmed_at IS NOT NULL
      AND lower(split_part(u.email, '@', 2)) IN ('yampa.com.br','yampa.com','4blue.com.br','yampa.internal')
  )
$$;
REVOKE ALL ON FUNCTION public.is_internal_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_internal_user(uuid) TO authenticated, service_role;

DO $$
DECLARE
  t text;
  p record;
  targets text[] := ARRAY['discount_tiers','ac_stage_move_config','churn_ai_insights','precificacao_proposals','tags','pricing_proposals','tactical_metrics','metabase_monthly_agg','metas_churn_daily','cs_contact_logs','metas_ativos_pagantes_daily','teams','tactical_goals','tactical_recovery_reasons','cs_client_tags','chatwoot_csat_responses','cs_portfolio','commission_reference','campaign_history_audit','profiles','metabase_daily_raw','commission_price_map','goal_growth_baselines','campaign_history_metrics','finance_settings','access_levels','campaign_history_values','cs_engagement_config','cs_client_enrichment','metas_novos_pagantes_daily','tactical_realized_overrides','metas_pre_churn','ac_owner_seller_map','cs_tags','commission_settings','commission_triggers','commission_closings','tactical_campaign_coupons','pricing_versions','operational_goal_overrides','campaign_history','pipelines','precificacao_insumos','chatwoot_audit_settings','campaign_plan_scenarios','goal_categories','commission_products','cs_product_usage','cs_segments','tactical_lowtouch_areas','cs_assignment_rules','proposal_templates','tactical_stripe_daily_backup'];
  rls_off text[] := ARRAY['metas_price_daily','metas_origem_daily','metas_mrr_mensal','metas_trials_daily','metas_snapshot_diario','metas_churn_mensal','metas_daily','metas_de_para_price_id'];
BEGIN
  FOR p IN
    SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY(targets)
      AND NOT ('service_role' = ANY(roles) AND array_length(roles,1) = 1)
      AND NOT ('anon' = ANY(roles) AND array_length(roles,1) = 1)
      AND (qual = 'true' OR with_check = 'true')
  LOOP
    IF p.cmd = 'INSERT' THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (public.is_internal_user(auth.uid()))', p.policyname, p.tablename);
    ELSIF p.cmd IN ('SELECT','DELETE') THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (public.is_internal_user(auth.uid()))', p.policyname, p.tablename);
    ELSE
      IF p.qual = 'true' THEN
        EXECUTE format('ALTER POLICY %I ON public.%I USING (public.is_internal_user(auth.uid()))', p.policyname, p.tablename);
      END IF;
      IF p.with_check = 'true' THEN
        EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (public.is_internal_user(auth.uid()))', p.policyname, p.tablename);
      END IF;
    END IF;
  END LOOP;

  FOREACH t IN ARRAY rls_off LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Internal users read" ON public.%I FOR SELECT TO authenticated USING (public.is_internal_user(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "Admins manage" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;