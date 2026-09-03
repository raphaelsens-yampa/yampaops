-- 1) SEGMENTS
CREATE TABLE public.cs_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#01B8E0',
  cadence_days integer NOT NULL DEFAULT 60,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_segments TO authenticated;
GRANT ALL ON public.cs_segments TO service_role;
ALTER TABLE public.cs_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_segments read" ON public.cs_segments FOR SELECT TO authenticated USING (true);
CREATE POLICY "cs_segments write" ON public.cs_segments FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));

-- 2) ASSIGNMENT RULES
CREATE TABLE public.cs_assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES public.cs_segments(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'fixed',
  cs_user_ids uuid[] NOT NULL DEFAULT '{}',
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_assignment_rules TO authenticated;
GRANT ALL ON public.cs_assignment_rules TO service_role;
ALTER TABLE public.cs_assignment_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_assignment_rules read" ON public.cs_assignment_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "cs_assignment_rules write" ON public.cs_assignment_rules FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));

-- 3) ENRICHMENT
CREATE TABLE public.cs_client_enrichment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  industry text,
  notes text,
  source text NOT NULL DEFAULT 'manual',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_client_enrichment TO authenticated;
GRANT ALL ON public.cs_client_enrichment TO service_role;
ALTER TABLE public.cs_client_enrichment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_client_enrichment read" ON public.cs_client_enrichment FOR SELECT TO authenticated USING (true);
CREATE POLICY "cs_client_enrichment write" ON public.cs_client_enrichment FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));

-- 4) PORTFOLIO
CREATE TABLE public.cs_portfolio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  company_name text,
  cs_user_id uuid,
  segment_id uuid REFERENCES public.cs_segments(id) ON DELETE SET NULL,
  assignment_source text NOT NULL DEFAULT 'rule',
  assigned_by uuid,
  assigned_at timestamptz,
  plano text,
  nome_oferta text,
  stripe_price_id text,
  mrr numeric NOT NULL DEFAULT 0,
  previous_mrr numeric,
  origem_cliente text,
  recorrencia_pagamento text,
  data_inicio date,
  tenure_days integer,
  industry text,
  engagement_score integer,
  engagement_band text,
  churn_risk_score numeric,
  conversations_90d integer NOT NULL DEFAULT 0,
  last_client_message_at timestamptz,
  last_contact_at timestamptz,
  next_contact_due date,
  cadence_days integer,
  is_active boolean NOT NULL DEFAULT true,
  last_snapshot date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cs_portfolio_cs_user ON public.cs_portfolio(cs_user_id);
CREATE INDEX idx_cs_portfolio_segment ON public.cs_portfolio(segment_id);
CREATE INDEX idx_cs_portfolio_due ON public.cs_portfolio(next_contact_due);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_portfolio TO authenticated;
GRANT ALL ON public.cs_portfolio TO service_role;
ALTER TABLE public.cs_portfolio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_portfolio read" ON public.cs_portfolio FOR SELECT TO authenticated USING (true);
CREATE POLICY "cs_portfolio manage" ON public.cs_portfolio FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));
CREATE POLICY "cs_portfolio owner update" ON public.cs_portfolio FOR UPDATE TO authenticated
  USING (cs_user_id = auth.uid()) WITH CHECK (cs_user_id = auth.uid());

-- 5) CONTACT LOGS
CREATE TABLE public.cs_contact_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.cs_portfolio(id) ON DELETE CASCADE,
  email text NOT NULL,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  contacted_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL DEFAULT 'whatsapp',
  outcome text NOT NULL DEFAULT 'respondeu',
  note text,
  chatwoot_conversation_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cs_contact_logs_portfolio ON public.cs_contact_logs(portfolio_id, contacted_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_contact_logs TO authenticated;
GRANT ALL ON public.cs_contact_logs TO service_role;
ALTER TABLE public.cs_contact_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_contact_logs read" ON public.cs_contact_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "cs_contact_logs manage" ON public.cs_contact_logs FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));
CREATE POLICY "cs_contact_logs own insert" ON public.cs_contact_logs FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "cs_contact_logs own update" ON public.cs_contact_logs FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

-- 6) ENGAGEMENT CONFIG
CREATE TABLE public.cs_engagement_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weight_conversations numeric NOT NULL DEFAULT 35,
  weight_recency numeric NOT NULL DEFAULT 30,
  weight_csat numeric NOT NULL DEFAULT 10,
  weight_churn_risk numeric NOT NULL DEFAULT 15,
  weight_tenure numeric NOT NULL DEFAULT 10,
  band_high integer NOT NULL DEFAULT 70,
  band_mid integer NOT NULL DEFAULT 45,
  band_low integer NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_engagement_config TO authenticated;
GRANT ALL ON public.cs_engagement_config TO service_role;
ALTER TABLE public.cs_engagement_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_engagement_config read" ON public.cs_engagement_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "cs_engagement_config write" ON public.cs_engagement_config FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));
INSERT INTO public.cs_engagement_config (id) VALUES (gen_random_uuid());

-- 7) updated_at triggers
CREATE TRIGGER trg_cs_segments_updated BEFORE UPDATE ON public.cs_segments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cs_assignment_rules_updated BEFORE UPDATE ON public.cs_assignment_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cs_client_enrichment_updated BEFORE UPDATE ON public.cs_client_enrichment FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cs_portfolio_updated BEFORE UPDATE ON public.cs_portfolio FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cs_contact_logs_updated BEFORE UPDATE ON public.cs_contact_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cs_engagement_config_updated BEFORE UPDATE ON public.cs_engagement_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8) keep last_contact_at / next_contact_due in sync with contact logs
CREATE OR REPLACE FUNCTION public.cs_sync_last_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_last timestamptz; v_cad integer;
BEGIN
  SELECT max(contacted_at) INTO v_last FROM public.cs_contact_logs WHERE portfolio_id = COALESCE(NEW.portfolio_id, OLD.portfolio_id);
  SELECT COALESCE(p.cadence_days, s.cadence_days, 60) INTO v_cad
    FROM public.cs_portfolio p LEFT JOIN public.cs_segments s ON s.id = p.segment_id
    WHERE p.id = COALESCE(NEW.portfolio_id, OLD.portfolio_id);
  UPDATE public.cs_portfolio
     SET last_contact_at = v_last,
         next_contact_due = CASE WHEN v_last IS NULL THEN NULL
           ELSE ((v_last AT TIME ZONE 'America/Sao_Paulo')::date + COALESCE(v_cad, 60)) END
   WHERE id = COALESCE(NEW.portfolio_id, OLD.portfolio_id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_cs_contact_logs_sync AFTER INSERT OR UPDATE OR DELETE ON public.cs_contact_logs
FOR EACH ROW EXECUTE FUNCTION public.cs_sync_last_contact();