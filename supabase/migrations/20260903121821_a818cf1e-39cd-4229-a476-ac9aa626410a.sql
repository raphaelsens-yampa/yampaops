SELECT cron.unschedule('chatwoot-voice-extract-daily');
SELECT cron.schedule(
  'chatwoot-voice-extract-daily',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wdtdpyibiroufejijsmw.supabase.co/functions/v1/chatwoot-voice-extract',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', current_setting('app.settings.jwt_secret', true)
    ),
    body := '{"kind":"cron","triggered_by":"daily_cron"}'::jsonb
  ) AS request_id;
  $$
);