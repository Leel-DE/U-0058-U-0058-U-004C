# Automation Hub routing memory

## Source of truth

- Queue contracts: `packages/shared/src/schemas/automation.ts`
- Queue and shipment schema: `packages/db/src/schema/automation.ts`
- Atomic queue SQL: `packages/db/sql/0014_automation_hub.sql`
- Runtime supervisor: `apps/worker/src/automation/runtime-supervisor.ts`
- Browser execution allowlist: `apps/worker/src/automation/browser-job-executor.ts`
- Shipment workflow: `apps/worker/src/automation/shipment-handler.ts`
- Competition workflows: `apps/worker/src/automation/competition-handlers.ts`
- TorqueCore synchronization: `apps/worker/src/automation/torquecore-bridge.ts`
- Operations UI: `apps/web/src/app/(app)/automation`, `shipments`, `jobs`, `provider-health`, and `dead-letter`
- Operations actions: `apps/web/src/server/actions/automation.ts`
- Worker cancellation control: `apps/web/src/server/automation/control.ts` and `POST /automation/cancel`

## Invariants

1. A browser job can only be one of the three allowlisted types and must pass its versioned Zod payload schema.
2. The worker must claim through `claim_automation_job`; direct queued-to-running updates are not safe.
3. A job completion update must match both job ID and lease token.
4. Competition and shipment flows share BrowserLauncher and its concurrency budget.
5. Shipment provider navigation uses adapter-owned URLs, never a URL supplied in a job payload.
6. CAPTCHA is recorded per provider. It becomes `awaiting_user` only when no useful provider result exists and manual continuation is enabled.
7. OpenAI may rewrite the explanation but must not choose or mutate normalized status.
8. Server credentials remain in worker/Electron main process only.
9. `apps/worker/src/shipments` is legacy compatibility code and is not started from `server.ts`.
10. Cancelling a running job updates durable state and aborts its isolated Playwright context; deleting job history is limited to terminal jobs.
11. Bulk stop and delete operations are organization-scoped. Bulk deletion is blocked while active jobs remain.
12. Deleting a monitored store or product cancels jobs that reference it before database cascades remove dependent records.

## Operations controls

- `/automation` is the live operations surface for web, worker, Playwright, and TorqueCore bridge process state plus the organization queue.
- `/jobs` owns queue-wide stop/delete controls and per-job stop/delete controls.
- Owner-only destructive controls use explicit consequence copy; stopping all jobs requires `STOP ALL JOBS`, deleting history requires `DELETE ALL JOBS`, and deleting a competitor site requires its exact name.
- Worker events and active-job details must always be filtered by organization before returning them to the web client.

## Narrow validation

```text
pnpm.cmd db:migrate
pnpm.cmd db:verify
pnpm.cmd --filter @cr/shared test
pnpm.cmd --filter @cr/worker test
pnpm.cmd --filter @cr/web test
pnpm.cmd typecheck
pnpm.cmd build
```

For shipment classifier changes, also run the `1Z0R6D896828244757` regression test and, when public sites are reachable, a real queued run. Expected state: `info_received` with label-created evidence.
