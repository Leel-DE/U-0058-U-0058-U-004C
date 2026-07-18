-- Manual CAPTCHA solving is now opt-in. Flip the column defaults from true to
-- false so newly inserted shipments and discovery runs never enable manual
-- CAPTCHA takeover unless an operator explicitly turns it on. Existing rows keep
-- whatever value they already have.
alter table public.shipments
  alter column use_manual_captcha set default false;

alter table public.site_discovery_runs
  alter column use_manual_captcha set default false;
