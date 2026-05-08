
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT cron.schedule(
  'chatwoot-audit-alerts-daily',
  '0 9 * * *',
  $$select net.http_post(
    url:='https://wdtdpyibiroufejijsmw.supabase.co/functions/v1/chatwoot-audit-alerts-check',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkdGRweWliaXJvdWZlamlqc213Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMzMxMDIsImV4cCI6MjA5MTgwOTEwMn0.qrpIvyHbJlE990su4X9aPdwHrABgo14HWpksuC2ZRu4"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;$$
);
