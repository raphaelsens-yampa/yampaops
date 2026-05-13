
-- Sales Campaigns feature

CREATE TABLE public.sales_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  channel text NOT NULL DEFAULT 'outros',
  segment text,
  owner_id uuid,
  status text NOT NULL DEFAULT 'planejada',
  start_date date,
  end_date date,
  budget numeric NOT NULL DEFAULT 0,
  target_contacted integer NOT NULL DEFAULT 0,
  target_replies integer NOT NULL DEFAULT 0,
  target_conversions integer NOT NULL DEFAULT 0,
  target_mrr numeric NOT NULL DEFAULT 0,
  custom_field_defs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales_campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.sales_campaigns(id) ON DELETE CASCADE,
  name text,
  email text,
  email_norm text,
  phone text,
  phone_digits text,
  company text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'nao_trabalhado',
  matched_contact_id uuid,
  matched_chatwoot_contact_id bigint,
  matched_opportunity_id uuid,
  match_method text,
  last_touch_at timestamptz,
  mrr_generated numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scc_campaign ON public.sales_campaign_contacts(campaign_id);
CREATE INDEX idx_scc_email ON public.sales_campaign_contacts(email_norm);
CREATE INDEX idx_scc_phone ON public.sales_campaign_contacts(phone_digits);
CREATE INDEX idx_scc_status ON public.sales_campaign_contacts(campaign_id, status);

CREATE TABLE public.sales_campaign_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.sales_campaigns(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  contacted integer NOT NULL DEFAULT 0,
  replies integer NOT NULL DEFAULT 0,
  meetings integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  mrr_generated numeric NOT NULL DEFAULT 0,
  notes text,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scs_campaign_date ON public.sales_campaign_snapshots(campaign_id, snapshot_date DESC);

CREATE TABLE public.sales_campaign_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.sales_campaigns(id) ON DELETE CASCADE,
  file_name text,
  total_rows integer NOT NULL DEFAULT 0,
  inserted_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'completed',
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sci_campaign ON public.sales_campaign_imports(campaign_id);

-- RLS
ALTER TABLE public.sales_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_campaign_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_campaign_imports ENABLE ROW LEVEL SECURITY;

-- sales_campaigns
CREATE POLICY "Admins manage sales_campaigns" ON public.sales_campaigns
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Tatico view sales_campaigns" ON public.sales_campaigns
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));
CREATE POLICY "Tatico insert sales_campaigns" ON public.sales_campaigns
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'tatico'::app_role) AND auth.uid() = created_by);
CREATE POLICY "Tatico update sales_campaigns" ON public.sales_campaigns
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));

-- sales_campaign_contacts
CREATE POLICY "Admins manage scc" ON public.sales_campaign_contacts
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Tatico view scc" ON public.sales_campaign_contacts
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));
CREATE POLICY "Tatico insert scc" ON public.sales_campaign_contacts
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'tatico'::app_role));
CREATE POLICY "Tatico update scc" ON public.sales_campaign_contacts
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));
CREATE POLICY "Tatico delete scc" ON public.sales_campaign_contacts
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));

-- sales_campaign_snapshots
CREATE POLICY "Admins manage scs" ON public.sales_campaign_snapshots
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Tatico view scs" ON public.sales_campaign_snapshots
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));
CREATE POLICY "Tatico insert scs" ON public.sales_campaign_snapshots
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'tatico'::app_role) AND auth.uid() = created_by);
CREATE POLICY "Tatico update scs" ON public.sales_campaign_snapshots
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));
CREATE POLICY "Tatico delete scs" ON public.sales_campaign_snapshots
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));

-- sales_campaign_imports
CREATE POLICY "Admins manage sci" ON public.sales_campaign_imports
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Tatico view sci" ON public.sales_campaign_imports
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));
CREATE POLICY "Tatico insert sci" ON public.sales_campaign_imports
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'tatico'::app_role) AND auth.uid() = created_by);

-- Triggers
CREATE TRIGGER set_sales_campaigns_updated_at
  BEFORE UPDATE ON public.sales_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_scc_updated_at
  BEFORE UPDATE ON public.sales_campaign_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Normalize email/phone on insert/update
CREATE OR REPLACE FUNCTION public.scc_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email_norm := lower(trim(NEW.email));
    IF NEW.email_norm = '' THEN NEW.email_norm := NULL; END IF;
  ELSE
    NEW.email_norm := NULL;
  END IF;
  NEW.phone_digits := public.normalize_phone_digits(NEW.phone);
  RETURN NEW;
END;
$$;

CREATE TRIGGER scc_normalize_trg
  BEFORE INSERT OR UPDATE ON public.sales_campaign_contacts
  FOR EACH ROW EXECUTE FUNCTION public.scc_normalize();
