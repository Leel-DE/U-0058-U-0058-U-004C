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

## Local automation core

Competition Radar is the local browser-automation host:

    TorqueCore admin
      -> TorqueCore Supabase shipment_tracking_runs queue
      -> Radar shipment monitor (Realtime wake-up + 5 s reconciliation)
      -> atomic queued -> running claim
      -> sequential headed/off-screen Chrome checks
      -> bounded evidence -> OpenAI presentation -> Telegram
      -> result stored back in TorqueCore Supabase

- apps/worker/src/shipments is the whitelisted shipment handler. It cannot execute arbitrary URLs or remote code.
- Manual and six-hour scheduled checks share the durable TorqueCore queue. Running jobs older than 20 minutes are recovered.
- CAPTCHA is recorded and skipped; tariff/paywall, blocked, irrelevant, and timeout results never become evidence.
- Canonical TorqueCore shipment fields remain unchanged; the browser result is isolated evaluation data.
- apps/desktop is the Windows tray supervisor. It owns web, worker, and Inngest child processes, hides consoles, restarts failed services, and polls safe automation events.
- /automation is the authenticated operator surface. Worker /automation/status and /automation/events require WORKER_SHARED_SECRET.
