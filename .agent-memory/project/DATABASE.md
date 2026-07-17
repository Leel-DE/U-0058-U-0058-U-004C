# Database

The schema source of truth is `packages/db/src/schema`, with additional SQL under `packages/db/sql`.

Key operational groups:

- organizations, profiles, memberships, and invitations provide multi-tenant ownership and roles;
- stores, competitor products, scraping rules, scrape runs, and price snapshots represent competitor monitoring;
- alerts and notifications represent user-facing change events;
- discovery, extraction artifacts, selector versions, and repair attempts support scraper learning and diagnostics;
- `service_heartbeats` stores service/instance health snapshots but is currently updated when web health is requested;
- enum `run_status` already supplies `queued`, `running`, `success`, `partial`, and `failed` for scrape runs.

There is no generic automation job, attempt, lease, heartbeat, or typed result table yet. Shipment tracking should not overload `scrape_runs`; it needs a generic job envelope or a dedicated external-job projection with a stable typed payload.

Validation: `pnpm.cmd db:verify`, `pnpm.cmd typecheck`, and migration review before applying remote changes.
