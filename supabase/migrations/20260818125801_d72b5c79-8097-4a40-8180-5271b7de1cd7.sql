CREATE TABLE public.ac_cron_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT 'ac-funnel-sync',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ac_cron_tokens TO service_role;
ALTER TABLE public.ac_cron_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only ac_cron_tokens" ON public.ac_cron_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
INSERT INTO public.ac_cron_tokens (label) VALUES ('ac-funnel-sync');