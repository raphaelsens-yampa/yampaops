SELECT cron.schedule(
  'chatwoot-voice-extract-daily',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wdtdpyibiroufejijsmw.supabase.co/functions/v1/chatwoot-voice-extract',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"kind":"cron","triggered_by":"daily_cron"}'::jsonb
  ) AS request_id;
  $$
);