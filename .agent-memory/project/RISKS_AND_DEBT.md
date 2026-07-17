# Risks and debt

| Risk | Evidence | Consequence | Direction |
| --- | --- | --- | --- |
| No desktop supervisor | Root `dev` uses `concurrently`; no Electron/Tauri/service/tray package exists | visible consoles, manual startup, weak process recovery | add a single desktop/tray host with explicit service health and lifecycle |
| No generic durable local job contract | worker is HTTP request-driven; Inngest events are competitor-specific | shipment logic could become a second ad-hoc poller | introduce whitelisted job types, attempts, leases, and event logs |
| Standard Playwright is always headless | `apps/worker/src/fetcher/playwright.ts` | trackers that block headless sessions lose evidence | support per-handler browser profiles; shipment tracking requires headed minimized/off-screen Chrome |
| Heartbeat is demand-driven | `checkWorkerHealth` writes heartbeat only when health is loaded | stale health can appear current | worker-owned periodic heartbeat or desktop host heartbeat |
| Production and local topology differ | Vercel/Inngest/Fly/Supabase versus local Docker and three Node processes | environment drift and confusing ownership | make runtime mode explicit and keep integration adapters separate |
| Existing dirty files belong to the user | `.claude/settings.local.json`, `supabase/.temp/cli-latest` modified before this task | accidental overwrite or commit | preserve and exclude from task commits |
