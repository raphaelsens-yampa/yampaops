SELECT cron.schedule(
  'chatwoot-voice-extract-daily-v2',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wdtdpyibiroufejijsmw.supabase.co/functions/v1/chatwoot-voice-extract',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-job', 'chatwoot-voice-daily'
    ),
    body := '{"kind":"cron","triggered_by":"daily_cron"}'::jsonb
  ) AS request_id;
  $$
);

-- O endpoint de rotina usa o marcador interno somente para distinguir a execução agendada;
-- a própria função continua protegida pelo servidor e pelo segredo de IA.