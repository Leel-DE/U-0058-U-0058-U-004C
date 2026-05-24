# Competitor Radar

Local-first competitor monitoring SaaS for e-commerce SMBs. Track competitor prices, availability and promotions; get alerted on changes; export reports.

## Stack

- Next.js 15, React 19, TypeScript, Tailwind
- Supabase CLI local stack: Postgres, Auth, Storage, Realtime, Studio
- Drizzle ORM
- Inngest dev server for local background jobs
- Fastify scraper worker with Cheerio and lazy Playwright
- pnpm monorepo

## Quick Start

```bash
pnpm install
pnpm setup:local
pnpm dev
```

Local URLs:

- Web app: `http://localhost:3000`
- Worker: `http://localhost:4000`
- Supabase Studio: `http://localhost:54323`
- Inngest UI: `http://localhost:8288`
- Inbucket: `http://localhost:54324`

Demo login:

```txt
admin@demo.local
DemoAdmin!2026
```

See [LOCAL_DEV.md](LOCAL_DEV.md) for full Windows setup, env mapping, reset flow, troubleshooting, and the local scraping pipeline.

## Monorepo Layout

```txt
apps/
  web/        Next.js app, server actions, Inngest functions
  worker/     Fastify scraper service
packages/
  db/         Drizzle schema, SQL helpers, seed
  shared/     Zod schemas, DTOs, shared types
supabase/
  config.toml Local Supabase CLI stack
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm setup:local` | One-command local bootstrap |
| `pnpm dev` | Run web, worker, and Inngest dev server |
| `pnpm dev:web` | Run only web |
| `pnpm dev:worker` | Run only scraper worker |
| `pnpm dev:inngest` | Run only Inngest dev server |
| `pnpm db:push` | Push schema and SQL helpers |
| `pnpm db:seed` | Seed local data and auth user |
| `pnpm db:reset` | Reset local Supabase DB and reseed |
| `pnpm db:studio` | Open Supabase Studio |
| `pnpm supabase:start` | Start local Supabase |
| `pnpm supabase:stop` | Stop local Supabase |

## Production

Production deploy artifacts are still present in `docs/DEPLOY.md`, `apps/web/vercel.json`, and `apps/worker/fly.toml`, but local development does not depend on those services.
