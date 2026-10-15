SELECT cron.schedule(
  'stripe-4blue-sync-daily',
  '45 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wdtdpyibiroufejijsmw.supabase.co/functions/v1/stripe-4blue-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-job', 'stripe-4blue-sync-daily'
    ),
    body := '{"kind":"cron","triggered_by":"daily_cron"}'::jsonb
  ) AS request_id;
  $$
);