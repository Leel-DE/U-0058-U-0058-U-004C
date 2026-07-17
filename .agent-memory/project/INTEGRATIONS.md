# Integrations

| Integration | Current role | Entry points | Secrets and boundary | Failure modes |
| --- | --- | --- | --- | --- |
| Supabase local/cloud | Auth, Postgres, Storage, Realtime | `apps/web/src/lib/supabase`, `packages/db`, `supabase/config.toml` | anon key may be public; service-role key is server-only | local Docker unavailable, migration drift, RLS mismatch |
| Inngest | Cron, retries, event fan-out, concurrency | `apps/web/src/lib/inngest` and `/api/inngest` | event/signing keys are server-only | dev server/cloud unavailable, duplicate or stale events |
| Fastify worker | Executes scraping and discovery over HTTP | `apps/worker/src/server.ts` | all non-health routes require bearer `WORKER_SHARED_SECRET` | worker offline, invalid payload, browser exhaustion |
| Playwright | Headless pooled scraping plus headed manual sessions | `apps/worker/src/fetcher/playwright.ts`, `apps/worker/src/manual` | browser state is local; do not log cookies or storage | CAPTCHA, CDN block, browser launch failure, orphan session |
| Gemini | Optional extraction and selector assistance | `apps/worker/src/ai` | provider keys are worker-only | disabled provider, rate limit, invalid structured output |
| Resend/webhook | Notification delivery | `apps/web/src/server/notifications` | credentials and webhook targets are server-only | delivery retries, invalid endpoint |
| Vercel/Fly/Supabase Cloud | Documented production split | `docs/DEPLOY.md`, `apps/web/vercel.json`, `apps/worker/fly.toml` | production secrets are platform-scoped | environment drift, worker cold/offline, cloud orchestration unavailable |

| TorqueCore Supabase | Durable remote shipment queue and result store | apps/worker/src/shipments/monitor.ts, apps/worker/src/shipments/run.ts | separate server-only TORQUECORE_SUPABASE_* credentials | queue offline, stale running job, duplicate active run, schema drift |
| OpenAI and Telegram for TorqueCore | User-facing shipment summary and notification | apps/worker/src/shipments/run.ts, apps/worker/src/shipments/telegram.ts | separate TORQUECORE_OPENAI_* and TORQUECORE_TELEGRAM_* variables | structured output failure, notification failure |
| Electron desktop supervisor | Hidden Windows runtime, tray status, process recovery | apps/desktop/src/main.mjs | local OS process boundary; logs contain no env values | app exit, port conflict, missing Node/Docker |

Import TorqueCore credentials with node scripts/import-torquecore-env.mjs; the script maps values without printing secrets.
