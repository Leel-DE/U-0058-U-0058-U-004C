# Competitor Radar project index

| Subsystem | Purpose | Source of truth | Entry points | Validation |
| --- | --- | --- | --- | --- |
| Web control plane | Authenticated Next.js UI, Server Actions, analytics, health, and Inngest functions | `apps/web` | `src/app`, `src/server/actions`, `src/lib/inngest/functions.ts` | `pnpm.cmd --filter @cr/web typecheck`, `pnpm.cmd --filter @cr/web test` |
| Scraper worker | Bearer-authenticated Fastify service for Cheerio, Playwright, discovery, selector repair, and manual browser sessions | `apps/worker/src` | `server.ts`, `fetcher/playwright.ts`, `manual/browser-session-manager.ts` | `pnpm.cmd --filter @cr/worker typecheck`, `pnpm.cmd --filter @cr/worker test` |
| Database | Drizzle schema plus raw SQL for RLS, views, storage, verification, and operational tables | `packages/db` | `src/schema/index.ts`, `src/apply-sql.ts`, `src/verify-schema.ts` | `pnpm.cmd db:verify`, `pnpm.cmd typecheck` |
| Shared contracts | Cross-package DTOs, Zod schemas, constants, and result types | `packages/shared/src` | `schemas`, `types.ts`, `constants.ts` | `pnpm.cmd --filter @cr/shared typecheck`, `pnpm.cmd --filter @cr/shared test` |
| Background orchestration | Five-minute scheduling, store fan-out, product retries, and per-store throttling | `apps/web/src/lib/inngest/functions.ts` | `/api/inngest`, Inngest cron/events | `pnpm.cmd --filter @cr/web test` plus local Inngest smoke |
| Local runtime | Electron tray app supervises hidden web, worker, and Inngest processes with automatic restart | `apps/desktop/src/main.mjs` and root scripts | `pnpm.cmd dev:desktop`, Windows task `Competition Radar Automation` | tray state plus health routes on ports 3000, 4000, and 8288 |
| Shipment automation | Durable TorqueCore queue monitor, sequential headed browser checks, bounded evidence, AI presentation, Telegram, and safe event timeline | `apps/worker/src/shipments`, `apps/worker/src/automation` | TorqueCore `shipment_tracking_runs`, `/automation`, `/api/automation` | worker tests/typecheck/build plus a real queued shipment run |

See `ARCHITECTURE.md`, `INTEGRATIONS.md`, `DATABASE.md`, `VALIDATION.md`, and `RISKS_AND_DEBT.md` before architecture-changing work.
