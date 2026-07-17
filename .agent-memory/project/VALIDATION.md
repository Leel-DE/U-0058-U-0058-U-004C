# Validation

## Baseline verified 2026-07-17

- Node `v24.11.1`; project requires Node 20.11 or newer.
- pnpm `9.12.0` through `pnpm.cmd` on Windows. PowerShell script execution policy blocks `pnpm.ps1`, so use `pnpm.cmd` in automation.
- Docker server `29.6.1` available.
- Local Supabase ports 54321, 54322, and 54323 listening.
- Web 3000, worker 4000, and Inngest 8288 were not running.
- `pnpm.cmd typecheck`: 4/4 packages successful.
- `pnpm.cmd test`: 40 test files and 162 tests successful.

## Proportional checks

- shared contract: shared package tests and typecheck;
- worker/browser change: worker tests, typecheck, `/health/playwright`, and a real browser smoke;
- web action/UI change: web tests, typecheck, and affected route smoke;
- schema change: db typecheck, migration review, `db:verify`, and local database application;
- desktop supervisor: start, stop, duplicate-start, crash recovery, tray behavior, hidden-console check, and service health.

Use `pnpm.cmd` rather than `pnpm` from Windows PowerShell.
