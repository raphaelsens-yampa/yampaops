CREATE TABLE public.metabase_ingest_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  data_ref date,
  fonte text NOT NULL DEFAULT 'claude',
  target_table text,
  rows_received integer NOT NULL DEFAULT 0,
  rows_written integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  error_message text,
  raw_payload jsonb NOT NULL
);

CREATE INDEX metabase_ingest_log_data_idx ON public.metabase_ingest_log (data_ref DESC, target_table);
CREATE INDEX metabase_ingest_log_received_idx ON public.metabase_ingest_log (received_at DESC);

GRANT SELECT ON public.metabase_ingest_log TO authenticated;
GRANT ALL ON public.metabase_ingest_log TO service_role;

ALTER TABLE public.metabase_ingest_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e taticos podem ver o log de ingestao"
ON public.metabase_ingest_log
FOR SELECT
TO authenticated
USING (public.is_tatico_or_admin(auth.uid()));