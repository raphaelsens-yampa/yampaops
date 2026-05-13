
CREATE TABLE public.lead_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  name text NOT NULL,
  source_file_name text,
  total_rows integer NOT NULL DEFAULT 0,
  matched_chatwoot integer NOT NULL DEFAULT 0,
  matched_paying integer NOT NULL DEFAULT 0,
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'processing',
  error_message text
);

CREATE TABLE public.lead_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.lead_imports(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  lead_email text,
  lead_phone_raw text,
  lead_phone_normalized text,
  lead_name text,
  lead_origin text,
  lead_campaign text,
  lead_created_at timestamptz,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  cw_match_method text,
  cw_conversation_ids bigint[] NOT NULL DEFAULT '{}',
  cw_first_contact_at timestamptz,
  cw_first_agent_name text,
  cw_first_agent_email text,
  cw_total_conversations integer NOT NULL DEFAULT 0,
  cw_total_messages integer NOT NULL DEFAULT 0,
  cw_customer_replied boolean NOT NULL DEFAULT false,
  cw_last_status text,
  cw_last_label text,
  stripe_paying boolean NOT NULL DEFAULT false,
  stripe_converted_at timestamptz,
  stripe_mrr numeric NOT NULL DEFAULT 0,
  stripe_plan text,
  hours_to_first_contact numeric,
  sla_bucket text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_import_rows_import_id ON public.lead_import_rows(import_id);
CREATE INDEX idx_lead_import_rows_email ON public.lead_import_rows(lead_email);
CREATE INDEX idx_lead_import_rows_phone ON public.lead_import_rows(lead_phone_normalized);

ALTER TABLE public.lead_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage lead_imports" ON public.lead_imports FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Tatico view lead_imports" ON public.lead_imports FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));
CREATE POLICY "Tatico insert lead_imports" ON public.lead_imports FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'tatico'::app_role) AND auth.uid() = created_by);

CREATE POLICY "Admins manage lead_import_rows" ON public.lead_import_rows FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Tatico view lead_import_rows" ON public.lead_import_rows FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));

CREATE TRIGGER update_lead_imports_updated_at BEFORE UPDATE ON public.lead_imports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
