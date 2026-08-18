DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid, jobname, command FROM cron.job WHERE jobname ILIKE '%ac-funnel%' LOOP
    PERFORM cron.unschedule(j.jobid);
    PERFORM cron.schedule(j.jobname, '*/15 * * * *', j.command);
  END LOOP;
END $$;