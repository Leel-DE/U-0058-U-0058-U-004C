# Risks and debt

| Risk | Evidence | Consequence | Direction |
| --- | --- | --- | --- |
| Automation event history is in memory | apps/worker/src/automation/events.ts keeps the latest 200 events | worker restart clears the Radar event timeline | persist events if cross-restart audit history becomes necessary; TorqueCore run history remains durable |
| Shipment queue is integration-specific | TorqueCore owns the durable table; other future automation types do not yet share a generic queue | a second integration could duplicate monitor lifecycle code | extract the proven claim/recovery/event lifecycle only when another job type is added |
| Standard Playwright is always headless | `apps/worker/src/fetcher/playwright.ts` | trackers that block headless sessions lose evidence | support per-handler browser profiles; shipment tracking requires headed minimized/off-screen Chrome |
| Heartbeat is demand-driven | `checkWorkerHealth` writes heartbeat only when health is loaded | stale health can appear current | worker-owned periodic heartbeat or desktop host heartbeat |
| Production and local topology differ | Vercel/Inngest/Fly/Supabase versus local Docker and three Node processes | environment drift and confusing ownership | make runtime mode explicit and keep integration adapters separate |
| Existing dirty files belong to the user | `.claude/settings.local.json`, `supabase/.temp/cli-latest` modified before this task | accidental overwrite or commit | preserve and exclude from task commits |
