# Architecture

## Current runtime

```text
Next.js web / Server Actions
  -> Inngest event and cron orchestration
  -> Fastify worker over Bearer-authenticated HTTP
  -> Cheerio or pooled headless Playwright
  -> Drizzle/Postgres and Supabase Storage
  -> alerts, dashboards, and exports
```

- `apps/web` is the authenticated control plane. Organization ownership is enforced before mutations.
- `apps/worker` is an HTTP execution service. `/health` is public; operational endpoints require `WORKER_SHARED_SECRET`.
- Inngest owns competitor scheduling, retries, fan-out, and per-store concurrency. The worker itself does not poll a queue.
- Standard Playwright uses one pooled headless browser/context with a page limit. Manual takeover uses separate headed persistent contexts and domain storage.
- `packages/shared` owns cross-process contracts. New job types should start there rather than defining unrelated request shapes in each service.
- `packages/db` is the schema source of truth. Raw SQL layers add RLS, views, storage, and operational helpers.

## Target direction requested 2026-07-17

Competition Radar should become the local browser-automation host. Shipment tracking should be a whitelisted job handler, not arbitrary remote code. A future desktop/tray shell should supervise services and expose health/events without console windows. TorqueCore remains a data consumer and remote source of shipment jobs/results.

This target is not implemented yet. Update this file after the runtime, contracts, and deployment path are verified.
