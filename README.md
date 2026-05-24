# Competitor Radar

Ethical price intelligence for e-commerce SMBs. Track competitor prices, availability and promotions; get alerted on changes; export reports.

## Stack

- **Frontend / API**: Next.js 15 (App Router, RSC, Server Actions), React 19, TypeScript strict, Tailwind, shadcn/ui, Recharts, TanStack Table, React Hook Form + Zod
- **Database**: Supabase Postgres + Row Level Security + Realtime + Storage
- **ORM**: Drizzle
- **Background jobs**: Inngest (cron + events + per-domain concurrency)
- **Scraper**: Separate Fastify worker, Cheerio (default) + Playwright (when `js_required`), JSON-LD + OpenGraph + selector cascade
- **Email**: Resend
- **Observability**: Sentry + PostHog
- **Testing**: Vitest (unit/integration), Playwright (E2E), Testing Library, MSW
- **Deploy**: Vercel (web) + Fly.io or Railway (worker) + Supabase Cloud + Inngest Cloud

## Monorepo layout

```
apps/
  web/        Next.js 15 app — UI, server actions, Inngest functions
  worker/     Fastify scraper service (Cheerio + Playwright)
packages/
  db/         Drizzle schema, migrations, seed
  shared/     Zod schemas, DTO, shared types
.github/workflows/  CI
```

## Prerequisites

- Node.js ≥ 20.11
- pnpm 9.12+ (`npm i -g pnpm@9.12.0`)
- Docker Desktop (only if you run worker / Playwright locally in container)
- A Supabase project (free tier OK)
- An Inngest account (free tier OK) OR `npx inngest-cli@latest dev` for local

## Quick start

```bash
# 1. install deps
pnpm install

# 2. configure environment
cp .env.example .env.local
# edit .env.local with your Supabase + worker secret

# 3. push schema + seed demo data
pnpm db:push
pnpm db:seed

# 4. run everything in dev mode
pnpm dev           # Next.js on :3000, worker on :4000
# in a second terminal:
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Open http://localhost:3000 → sign up → you should land on `/dashboard`.

## Scripts

| Command | Description |
|--|--|
| `pnpm dev` | Run web + worker in parallel |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | TypeScript across the monorepo |
| `pnpm lint` | ESLint + Tailwind class sort check |
| `pnpm test` | Vitest unit + integration |
| `pnpm test:e2e` | Playwright E2E (web only) |
| `pnpm db:push` | Push Drizzle schema to Supabase |
| `pnpm db:migrate` | Apply generated migrations |
| `pnpm db:seed` | Insert demo organization + sample stores/products |

## Legal & ethics

This product is built around **ethical scraping**:

- Respects `robots.txt` (configurable per-store, default ON)
- Identifies itself with a real User-Agent and contact email
- Enforces per-domain crawl delay (min 2 s, default 5 s)
- Will NOT bypass logins, paywalls, captchas, or anti-bot challenges
- Falls back to manual price entry / CSV import when scraping is not appropriate

If you operate a website and want us to stop crawling, contact the address in the User-Agent header.

## Docs

- [docs/DEPLOY.md](docs/DEPLOY.md) — Vercel + Fly.io + Supabase + Inngest setup
- [docs/SCRAPING-POLICY.md](docs/SCRAPING-POLICY.md) — User-Agent, rate-limit and opt-out policy

## Architecture in one paragraph

The web app (`apps/web`) runs on Vercel and owns the database (via Drizzle), UI (RSC + Server Actions), and Inngest function definitions. The scraper (`apps/worker`) is a stateless Fastify service kept warm on Fly.io — it accepts `POST /scrape` with `(url, rules)`, fetches via Cheerio or Playwright, runs the JSON-LD → OpenGraph → CSS selector cascade, and returns the extracted payload (or an error code). Inngest cron picks products whose `next_run_at` has passed, fans out one event per store, then one per product with `concurrency-key=storeId, limit=1` so we never hit the same domain twice in parallel. Each successful snapshot triggers alert evaluation, which writes to `notifications` (in-app + Realtime delivery) and optionally dispatches email via Resend. Supabase RLS provides organization-level isolation; the app additionally filters by `org_id` in code as defense in depth.

## License

Proprietary — all rights reserved.
