-- Operators can pin a fixed check interval per shipment. NULL keeps the
-- adaptive schedule (interval derived from the current status).
alter table public.shipments
  add column if not exists check_interval_override_minutes integer
  check (
    check_interval_override_minutes is null
    or check_interval_override_minutes between 15 and 10080
  );
