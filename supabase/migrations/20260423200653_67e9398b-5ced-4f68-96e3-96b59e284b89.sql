-- 1. Add ac_id to existing tables
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS ac_id text;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_ac_id_key ON public.contacts(ac_id) WHERE ac_id IS NOT NULL;

ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS ac_id text;
CREATE UNIQUE INDEX IF NOT EXISTS opportunities_ac_id_key ON public.opportunities(ac_id) WHERE ac_id IS NOT NULL;

ALTER TABLE public.pipelines ADD COLUMN IF NOT EXISTS ac_id text;
CREATE UNIQUE INDEX IF NOT EXISTS pipelines_ac_id_key ON public.pipelines(ac_id) WHERE ac_id IS NOT NULL;

ALTER TABLE public.pipeline_stages ADD COLUMN IF NOT EXISTS ac_id text;
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_ac_id_key ON public.pipeline_stages(ac_id) WHERE ac_id IS NOT NULL;

ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS ac_id text;
CREATE UNIQUE INDEX IF NOT EXISTS activities_ac_id_key ON public.activities(ac_id) WHERE ac_id IS NOT NULL;

-- 2. integration_settings (singleton)
CREATE TABLE IF NOT EXISTS public.integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ac_account_url text,
  ac_webhook_secret text,
  last_full_sync_at timestamp with time zone,
  sync_status text DEFAULT 'idle',
  sync_log jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage integration_settings"
  ON public.integration_settings
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_integration_settings_updated_at
  BEFORE UPDATE ON public.integration_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed singleton row
INSERT INTO public.integration_settings (sync_status) VALUES ('idle')
  ON CONFLICT DO NOTHING;

-- 3. ac_pipeline_selection
CREATE TABLE IF NOT EXISTS public.ac_pipeline_selection (
  ac_pipeline_id text PRIMARY KEY,
  ac_pipeline_title text NOT NULL,
  is_selected boolean NOT NULL DEFAULT false,
  local_pipeline_id uuid,
  deals_count integer DEFAULT 0,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ac_pipeline_selection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ac_pipeline_selection"
  ON public.ac_pipeline_selection
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_ac_pipeline_selection_updated_at
  BEFORE UPDATE ON public.ac_pipeline_selection
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. integration_sync_errors
CREATE TABLE IF NOT EXISTS public.integration_sync_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  ac_id text,
  error_message text NOT NULL,
  payload jsonb,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_sync_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage integration_sync_errors"
  ON public.integration_sync_errors
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_sync_errors_resolved ON public.integration_sync_errors(resolved, created_at DESC);