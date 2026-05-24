alter table stores
  add column if not exists discovery_preset text,
  add column if not exists discovery_defaults_json jsonb;
