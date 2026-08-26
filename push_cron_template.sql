-- PrintBook Push Cron
-- Replace YOUR_PROJECT_REF and YOUR_PUSH_CRON_SECRET, then run this once.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('printbook-push-check')
where exists (
  select 1 from cron.job where jobname = 'printbook-push-check'
);

select cron.schedule(
  'printbook-push-check',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/push-notifications',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-printbook-cron-secret','YOUR_PUSH_CRON_SECRET'
    ),
    body := jsonb_build_object('action','scan'),
    timeout_milliseconds := 10000
  );
  $$
);
