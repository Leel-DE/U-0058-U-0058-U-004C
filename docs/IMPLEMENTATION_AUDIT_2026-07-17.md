# Automation Hub implementation audit — 2026-07-17

## Before

- Competition used synchronous Server Actions and Inngest fan-out, with a pooled headless Playwright implementation.
- Shipment tracking was a separate 1,200-line remote TorqueCore polling runtime that launched its own browser and kept operational events only in memory.
- There was no generic durable job envelope, attempt budget, priority, lease, heartbeat, dead-letter queue, provider health model or shipment UI in Radar.
- Electron had safe renderer isolation but allowed every requested external URL scheme and host.
- Server Actions exposed raw internal exception messages.
- The local database contained raw-SQL operational tables that were not represented in the Drizzle migration journal.

## Implemented

- Shared Browser Automation Core and strict allowlisted job contracts.
- Atomic priority queue, starvation aging, lease heartbeat, stale recovery, retry budget and dead-letter state.
- Competition enqueue path moved to the shared queue; Playwright fetching now uses the shared launcher/context manager.
- Complete local shipment persistence, adaptive scheduling, UPS/Postal Ninja/ParcelsApp/Ship24/17TRACK/Yanwen adapters, cookie/popup handling, CAPTCHA workflow state, provider circuit breaker and normalized consensus report.
- Optional OpenAI presentation with schema validation and deterministic fallback.
- Important-change Telegram notifications with persistent deduplication.
- TorqueCore request/result bridge so a phone or remote admin can trigger work executed by the local PC.
- Dashboard entry point, Shipments list/add/bulk/detail, job progress/report, Provider Health, Dead Letter Queue and responsive grouped navigation.
- RLS boundary and safe `shipment_tracking_public` view.
- Electron OS-backed credential vault primitive, navigation restrictions and Automation Hub branding.
- Next.js moved from vulnerable 15.1.3 to maintenance release 15.5.20, Drizzle ORM to 0.45.2, and patched transitive overrides were pinned; `pnpm audit --prod` reports no known vulnerabilities. Internal Server Action errors are sanitized and security headers were added.

## Verification evidence

- `pnpm.cmd typecheck`: passed for web, worker, shared and database packages.
- `pnpm.cmd test`: 31 worker files / 145 tests, 10 web files / 35 tests, and 1 shared file / 8 tests passed (188 total), including the live-status regression.
- Playwright UI smoke: `/login` rendered as `Вход — Automation Hub` without compile overlays or console errors after aligning local dev with the webpack resolver used in production.
- `pnpm.cmd db:verify`: 24 required tables, 12 indexes, 4 views, 19 RLS tables, 19 policies and 3 queue functions passed.
- `pnpm.cmd build`: passed on Next.js 15.5.20 for both web and worker production outputs.
- Transactional queue smoke: an aged low-priority job won starvation protection, was leased atomically, renewed its heartbeat and persisted 42% progress; the transaction was rolled back.
- Real local runtime: TorqueCore bridge connected, one shipment imported, 8 competition jobs completed successfully, and a real multi-provider shipment check produced durable job/provider/event rows.

## Known limits

- CAPTCHA is never bypassed. A job can wait for manual continuation, but provider-specific persistent-profile handoff is still an extension point; a successful non-CAPTCHA provider lets the multi-source job finish as partial.
- Public tracker DOM changes remain an external risk. Provider health/circuit breakers reduce repeated load but cannot guarantee availability.
- The deterministic status extractor is the source of truth; OpenAI may improve wording only and cannot change the normalized status.
- Supplier and SEO domains are architecture extension points, not implemented business modules in this branch.
- Real mobile triggering requires the local PC and Electron runtime to remain online; the phone never runs the browser itself.
