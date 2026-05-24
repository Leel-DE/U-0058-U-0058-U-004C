# Local-First Development

This project is configured to run without Supabase Cloud, Vercel, Fly.io, Resend, Sentry, PostHog, Stripe, or any external webhook dependency in development.

## Requirements

- Windows 10/11
- Node.js 20.11+
- pnpm 9.12+
- Docker Desktop with Linux containers
- Supabase CLI, either installed globally or available through `pnpm dlx supabase@latest`
- 7 GB+ available RAM is recommended for the full Supabase local stack

## Local Services

| Service | URL / port | Notes |
| --- | --- | --- |
| Web app | `http://localhost:3000` | Next.js dev server |
| Scraper worker | `http://localhost:4000` | Fastify, Bearer auth, local fixtures |
| Inngest dev server | `http://localhost:8288` | Local event server/UI |
| Supabase API | `http://127.0.0.1:54321` | Auth, REST, Realtime, Storage API |
| Postgres | `127.0.0.1:54322` | `postgres/postgres` |
| Supabase Studio | `http://localhost:54323` | Local Studio |
| Inbucket | `http://localhost:54324` | Local email sink from Supabase Auth |

## First Startup

```bash
pnpm install
pnpm setup:local
pnpm dev
```

`pnpm setup:local` does the local bootstrap:

1. Checks Docker CLI and Docker daemon.
2. Checks Supabase CLI, falling back to `pnpm dlx supabase@latest`.
3. Runs `supabase start`.
4. Reads local Supabase status and writes `.env.local`.
5. Ensures Chromium is installed for the Playwright worker.
6. Applies Drizzle schema and SQL helpers to local Postgres.
7. Seeds demo data and a local Supabase Auth admin user.
8. Verifies database connectivity.

Default login:

```txt
email: admin@demo.local
password: DemoAdmin!2026
```

## Environment Mapping

After `supabase start`, the setup script maps local values into `.env.local`:

```env
NODE_ENV=development
LOCAL_DEV_MODE=true
NEXT_PUBLIC_APP_URL=http://localhost:3000

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service_role key>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

INNGEST_EVENT_KEY=local_dev_event_key
INNGEST_SIGNING_KEY=signkey-local-dev

WORKER_URL=http://localhost:4000
WORKER_HOST=127.0.0.1
WORKER_SHARED_SECRET=local-worker-secret-change-me
WORKER_BROWSER_MAX_PAGES=2

RESEND_API_KEY=
RESEND_FROM_EMAIL=Competitor Radar Local <admin@demo.local>
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

SEED_ADMIN_EMAIL=admin@demo.local
SEED_ADMIN_PASSWORD=DemoAdmin!2026
```

Do not point local development at `*.supabase.co`, Vercel, Fly.io, or paid third-party services.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm setup:local` | One-command local bootstrap |
| `pnpm dev` | Runs web, worker, and Inngest dev server |
| `pnpm dev:web` | Runs only Next.js on port 3000 |
| `pnpm dev:worker` | Runs only worker on port 4000 |
| `pnpm dev:inngest` | Runs only local Inngest dev server |
| `pnpm db:push` | Pushes Drizzle schema and SQL helpers to local DB |
| `pnpm db:seed` | Seeds local demo org/products/snapshots/admin |
| `pnpm db:reset` | Resets Supabase DB, reapplies schema, reseeds |
| `pnpm db:studio` | Opens local Supabase Studio |
| `pnpm supabase:start` | Starts Supabase local stack |
| `pnpm supabase:stop` | Stops Supabase local stack |

## Local Migration Flow

The current project uses Drizzle schema push as the development migration flow:

```bash
pnpm db:push
pnpm db:seed
```

`pnpm db:push` runs:

- `drizzle-kit push`
- `packages/db/src/apply-sql.ts`
- `packages/db/sql/*.sql` for extensions, triggers, RLS, views, and storage buckets

Generated Drizzle migrations can still be created with:

```bash
pnpm db:generate
pnpm db:migrate
```

The `supabase/migrations` directory is reserved for Supabase CLI SQL migrations if the project later moves from push-based local development to SQL migration files.

## Local Auth

Supabase Auth runs locally through the CLI stack:

- Email/password signup enabled.
- Email confirmation disabled for local development.
- Redirect allow-list includes `localhost:3000` and `127.0.0.1:3000`.
- SSR auth uses `@supabase/ssr` cookies in middleware and server components.
- Server Actions use the same session cookies.
- Seed creates a confirmed local admin through the local service role key.

Supabase Auth emails are captured by Inbucket at `http://localhost:54324`; they are not sent externally.

## Local Storage And Realtime

Storage is provided by local Supabase Storage on `http://127.0.0.1:54321/storage/v1`.

The SQL helper `packages/db/sql/0004_storage_buckets.sql` creates:

- `exports`
- `raw-html`

Realtime is provided by the local Supabase Realtime service. The notification bell subscribes to local `notifications` changes through the local Supabase URL.

## Local Background Jobs

`pnpm dev:inngest` runs:

```bash
inngest-cli dev -u http://localhost:3000/api/inngest
```

The Next.js route remains local:

```txt
http://localhost:3000/api/inngest
```

No Inngest Cloud app or dashboard is required for development.

## Local Scraping Pipeline

The worker runs on `localhost:4000` and requires:

```txt
Authorization: Bearer <WORKER_SHARED_SECRET>
```

The seeded competitor products point to worker-hosted fixture pages:

```txt
http://127.0.0.1:4000/fixtures/example-electronics/acme-hp-2000
http://127.0.0.1:4000/fixtures/acme-audio/hp-2000
```

This keeps the full demo scrape flow offline/local:

1. Add competitor.
2. Add or edit scraping rules.
3. Preview scrape.
4. Save snapshot.
5. Trigger background job.
6. Evaluate alerts.
7. Update dashboard.
8. Export reports to local Supabase Storage.

The worker uses Cheerio by default and launches Playwright lazily only for `js_required` or explicit Playwright strategy. Browser resources are reused, images/fonts/media are blocked, and `WORKER_BROWSER_MAX_PAGES` limits local Chromium concurrency.

## Cloud Dependency Audit

Cloud dependencies found before local-first setup:

- Supabase Cloud examples in `.env.example`, README, and deploy docs.
- Vercel config in `apps/web/vercel.json`.
- Fly.io worker config in `apps/worker/fly.toml`.
- Inngest Cloud references in README/deploy docs.
- Resend dependency and email sender.
- Optional Sentry/PostHog dependencies/env vars.
- Stripe schema field `organizations.stripe_customer_id`.
- External webhook notification enum support.

Local-first changes:

- `.env.example` now documents local Supabase only.
- `supabase/config.toml` defines local Auth, Storage, Realtime, Studio, Inbucket, Postgres.
- Root scripts start local Supabase/Inngest/worker/web.
- Resend package was removed; local email is logged and stored as notification rows.
- Sentry/PostHog packages are not installed; env defaults are empty.
- Worker fixture pages make seeded scraping work offline.
- Production deploy artifacts remain in place but are not used by local scripts.

## Troubleshooting

### PowerShell blocks pnpm.ps1

Use `pnpm.cmd` directly:

```powershell
pnpm.cmd install
pnpm.cmd setup:local
pnpm.cmd dev
```

### Docker is not found

Install Docker Desktop and restart the terminal. Confirm:

```powershell
docker --version
docker info
```

### Supabase CLI is not found

Install once:

```powershell
npm install -g supabase
```

Or let setup fall back to `pnpm dlx supabase@latest`. For offline development, prefer the global install.

### Port already in use

Common ports:

- `3000` web
- `4000` worker
- `54321` Supabase API
- `54322` Postgres
- `54323` Studio
- `54324` Inbucket
- `8288` Inngest

Find a Windows process:

```powershell
netstat -ano | findstr :54321
```

### Reset database

```bash
pnpm db:reset
```

This deletes local Supabase data, reapplies schema, and reseeds.

### Restart Supabase

```bash
pnpm supabase:stop
pnpm supabase:start
```

For a full wipe:

```bash
node scripts/supabase-local.mjs stop --no-backup
pnpm setup:local
```

### Playwright Chromium missing

```bash
pnpm --filter @cr/worker exec playwright install chromium
```

To skip browser installation during setup:

```bash
set SKIP_PLAYWRIGHT_INSTALL=1
pnpm setup:local
```

### Worker health

```bash
curl http://localhost:4000/health
```

Expected:

```json
{"ok":true,"mode":"local","ts":"..."}
```

### Test worker scraping directly

```bash
curl -X POST http://localhost:4000/scrape ^
  -H "content-type: application/json" ^
  -H "authorization: Bearer local-worker-secret-change-me" ^
  -d "{\"url\":\"http://127.0.0.1:4000/fixtures/example-electronics/acme-hp-2000\",\"strategy\":\"cheerio\",\"rules\":{\"titleSelector\":\"h1.product-title\",\"priceSelector\":\".price .current\",\"useJsonLd\":true,\"useOpenGraph\":true},\"respectRobots\":true,\"userAgent\":\"CompetitorRadarLocal/1.0\",\"timeoutMs\":15000}"
```
