-- Funis conectados
CREATE TABLE public.ac_funnels (
  ac_group_id text PRIMARY KEY,
  title text NOT NULL,
  is_connected boolean NOT NULL DEFAULT false,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_webhook_at timestamptz,
  deals_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ac_funnels TO authenticated;
GRANT ALL ON public.ac_funnels TO service_role;
ALTER TABLE public.ac_funnels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/tatico view ac_funnels" ON public.ac_funnels FOR SELECT TO authenticated USING (public.is_tatico_or_admin(auth.uid()));
CREATE POLICY "Admins manage ac_funnels" ON public.ac_funnels FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_ac_funnels_updated BEFORE UPDATE ON public.ac_funnels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Etapas dos funis
CREATE TABLE public.ac_funnel_stages (
  ac_stage_id text PRIMARY KEY,
  ac_group_id text NOT NULL,
  title text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ac_funnel_stages_group ON public.ac_funnel_stages(ac_group_id);
GRANT SELECT ON public.ac_funnel_stages TO authenticated;
GRANT ALL ON public.ac_funnel_stages TO service_role;
ALTER TABLE public.ac_funnel_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/tatico view ac_funnel_stages" ON public.ac_funnel_stages FOR SELECT TO authenticated USING (public.is_tatico_or_admin(auth.uid()));
CREATE POLICY "Admins manage ac_funnel_stages" ON public.ac_funnel_stages FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_ac_funnel_stages_updated BEFORE UPDATE ON public.ac_funnel_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Estado atual dos deals
CREATE TABLE public.ac_funnel_deals (
  ac_deal_id text PRIMARY KEY,
  ac_group_id text NOT NULL,
  ac_stage_id text,
  title text,
  contact_name text,
  contact_email text,
  ac_contact_id text,
  owner_id text,
  owner_name text,
  value numeric(14,2) NOT NULL DEFAULT 0,
  currency text,
  status integer NOT NULL DEFAULT 0,
  deal_created_at timestamptz,
  deal_updated_at timestamptz,
  stage_changed_at timestamptz,
  closed_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ac_funnel_deals_group ON public.ac_funnel_deals(ac_group_id);
CREATE INDEX idx_ac_funnel_deals_stage ON public.ac_funnel_deals(ac_stage_id);
CREATE INDEX idx_ac_funnel_deals_created ON public.ac_funnel_deals(deal_created_at);
GRANT SELECT ON public.ac_funnel_deals TO authenticated;
GRANT ALL ON public.ac_funnel_deals TO service_role;
ALTER TABLE public.ac_funnel_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/tatico view ac_funnel_deals" ON public.ac_funnel_deals FOR SELECT TO authenticated USING (public.is_tatico_or_admin(auth.uid()));
CREATE POLICY "Admins manage ac_funnel_deals" ON public.ac_funnel_deals FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_ac_funnel_deals_updated BEFORE UPDATE ON public.ac_funnel_deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Eventos de movimentacao
CREATE TABLE public.ac_funnel_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ac_deal_id text NOT NULL,
  ac_group_id text NOT NULL,
  event_type text NOT NULL DEFAULT 'stage_change',
  from_stage_id text,
  to_stage_id text,
  from_status integer,
  to_status integer,
  deal_value numeric(14,2) NOT NULL DEFAULT 0,
  contact_email text,
  owner_name text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'webhook',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_ac_funnel_stage_events ON public.ac_funnel_stage_events(
  ac_deal_id, event_type, COALESCE(from_stage_id,''), COALESCE(to_stage_id,''), occurred_at
);
CREATE INDEX idx_ac_stage_events_group_time ON public.ac_funnel_stage_events(ac_group_id, occurred_at);
CREATE INDEX idx_ac_stage_events_type ON public.ac_funnel_stage_events(event_type);
GRANT SELECT ON public.ac_funnel_stage_events TO authenticated;
GRANT ALL ON public.ac_funnel_stage_events TO service_role;
ALTER TABLE public.ac_funnel_stage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/tatico view ac_stage_events" ON public.ac_funnel_stage_events FOR SELECT TO authenticated USING (public.is_tatico_or_admin(auth.uid()));
CREATE POLICY "Admins manage ac_stage_events" ON public.ac_funnel_stage_events FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));