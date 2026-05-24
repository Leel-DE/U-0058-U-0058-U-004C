# Deployment

There are three independent moving pieces:

| Piece | Where it runs | Why |
|-------|---------------|-----|
| Web (Next.js)           | Vercel        | Serverless RSC + Server Actions |
| Worker (scraper)        | Fly.io / Railway / any Docker host | Needs warm Playwright browser, ≥1 GB RAM |
| Background orchestrator | Inngest Cloud (or self-hosted) | Cron + retries + per-domain concurrency |
| Postgres + Auth + Storage | Supabase Cloud | Managed PG, RLS, Realtime, S3-compatible storage |

## 1. Supabase

1. Create a project at https://supabase.com.
2. Settings → API: copy the URL, anon key, and service role key into `.env.local`.
3. Settings → Database: copy the connection strings (pooled `:6543` for runtime, direct `:5432` for migrations).
4. Apply schema and RLS:
   ```bash
   pnpm db:push      # drizzle-kit push + apply-sql (extensions, RLS, views, storage buckets)
   pnpm db:seed      # optional demo data
   ```
5. Authentication → Providers: enable Email/password (and OAuth if you want).
6. (Optional) disable email confirmation in development:
   Authentication → Settings → "Confirm email" off.

## 2. Worker on Fly.io

```bash
# one-time
flyctl auth login
flyctl apps create cr-worker

# secrets
flyctl secrets set WORKER_SHARED_SECRET=<long-random-string> --app cr-worker

# deploy
flyctl deploy --config apps/worker/fly.toml --dockerfile apps/worker/Dockerfile
```

Worker exposes `POST /scrape` (Bearer auth) and `GET /health`.

## 3. Inngest

Create an account at https://www.inngest.com → new app `competitor-radar` → copy `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`. The Vercel deployment exposes the SDK at `/api/inngest` — register the endpoint in the Inngest dashboard after first deploy.

For local development:
```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

## 4. Web on Vercel

```bash
vercel link
# Set environment variables (mirror your .env.local minus dev-only values):
#   DATABASE_URL (pooled), DIRECT_URL (direct)
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
#   INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
#   WORKER_URL (https://cr-worker.fly.dev), WORKER_SHARED_SECRET
#   RESEND_API_KEY, RESEND_FROM_EMAIL
#   NEXT_PUBLIC_APP_URL (https://your-domain)
vercel deploy --prod
```

## 5. Smoke test after deploy

1. Sign up → land on `/onboarding` → create organization → land on `/dashboard`.
2. Add a competitor with domain `httpbin.org`, currency EUR, JS not required.
3. Open scraping rules → leave selectors empty → enable JSON-LD/OG.
4. Add a competitor product URL (e.g. `https://httpbin.org/html`).
5. Trigger a manual snapshot (or hit "Test" from rules) — should round-trip the worker.
6. Visit `/exports` → "New export → Snapshots CSV" — file should appear under `exports/{orgId}/{exportId}.csv` in Supabase Storage.

## Observability

- Set `SENTRY_DSN` in worker env + `NEXT_PUBLIC_SENTRY_DSN` for client.
- Set `NEXT_PUBLIC_POSTHOG_KEY` and host to collect product analytics.
- Logs: `flyctl logs --app cr-worker`, Vercel function logs, Inngest run history.
