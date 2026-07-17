# Automation Core

## Product brief

- **User:** the owner operating Competition Radar and TorqueCore from a PC or phone.
- **Job:** keep browser-only automations running locally and make their verified results available in the server-backed admin before it is opened.
- **Current behavior:** TorqueCore queues shipment checks, a standalone console worker claims them, and the operator must keep that worker alive separately from Competition Radar.
- **Desired outcome:** Competition Radar is the single local automation host. It watches approved remote events, executes whitelisted browser handlers, writes results back to the owning system, and exposes status through one desktop/tray application.
- **Success signal:** a new or due TorqueCore shipment is checked without opening its admin; the stored result is visible on the next admin load; no console windows remain; worker failure is visible and recoverable.
- **Non-goals:** arbitrary remote code execution, arbitrary URL jobs, CAPTCHA solving, promotion of browser evidence into canonical shipment events without a separate validation decision, or merging the two applications' databases.
- **Object:** an automation job owned by an external integration.
- **Action and consequence:** the local host claims a typed job, opens only handler-defined public pages, writes a bounded typed result, and emits lifecycle events. A failed attempt remains recoverable and cannot erase the last confirmed result.
- **Permissions:** TorqueCore owners/managers may request manual refreshes; only the local server-side service role may claim or complete jobs; desktop event endpoints remain bearer-protected.

The automatic background default is the smallest coherent intervention (`rule/smallest-intervention`). The UI must cover disabled, offline, idle, queued, running, partial, failed, stale, and healthy states (`rule/cover-reachable-states`). Errors must identify the failed integration and recovery action without exposing secrets (`rule/error-states-recovery`).

## Runtime flow

```text
TorqueCore shipment created or manual refresh queued
  -> TorqueCore Supabase shipment_tracking_runs
  -> Competition Radar TorqueCore monitor (Realtime wake + polling reconciliation)
  -> atomic queued -> running claim
  -> whitelisted shipment_tracking handler
  -> installed Chrome, headed but minimized/off-screen
  -> UPS / Postal Ninja / ParcelsApp / Ship24 / 17TRACK
  -> CAPTCHA skipped; other transient failures retried within bounds
  -> optional OpenAI presentation and Telegram notification
  -> bounded result written to TorqueCore Supabase
  -> TorqueCore admin reads the stored result on normal page load
```

The integration also creates scheduled runs for enabled, non-final shipments when no active run exists and the latest attempt is older than the configured interval. Realtime reduces latency; polling is the recovery path for missed events and disconnected sockets.

## Generic worker contract

The Automation Core accepts only registered job types. The first registered type is `shipment_tracking`; competitor operations remain on their current Inngest flow until they are deliberately migrated.

Each lifecycle event contains:

- event id and timestamp;
- integration and job type;
- state (`info`, `queued`, `running`, `succeeded`, `partial`, `failed`, `offline`);
- safe message;
- bounded metadata without credentials, cookies, raw HTML, or full source payloads.

The worker keeps a bounded event ring for the desktop and web status surfaces and writes the same lifecycle to structured logs.

## Desktop behavior

- one application instance supervises Supabase readiness, web, worker, and Inngest;
- child processes are hidden and log to the local application-data directory;
- closing the main window hides it to the tray; it does not stop monitoring;
- tray actions open the application, open logs, restart services, or exit;
- only explicit Exit stops processes owned by the desktop host;
- startup and worker failures land in a visible recovery state rather than a silent spinner.

## Configuration boundary

Radar's own Supabase variables remain unchanged. TorqueCore uses separately named server-only variables:

```dotenv
TORQUECORE_SUPABASE_URL=
TORQUECORE_SUPABASE_SERVICE_ROLE_KEY=
TORQUECORE_OPENAI_API_KEY=
TORQUECORE_OPENAI_MODEL=gpt-5.4-mini
TORQUECORE_OPENAI_LANGUAGE=ru
TORQUECORE_TELEGRAM_BOT_TOKEN=
TORQUECORE_TELEGRAM_CHAT_ID=
TORQUECORE_TELEGRAM_SHIPMENTS_THREAD_ID=361
TORQUECORE_SHIPMENT_QUEUE_POLL_MS=5000
TORQUECORE_SHIPMENT_SCHEDULE_SCAN_MS=60000
TORQUECORE_SHIPMENT_REFRESH_INTERVAL_MS=21600000
TORQUECORE_SHIPMENT_STALE_RUNNING_MS=1200000
```

No `TORQUECORE_*_KEY` or token may use a `NEXT_PUBLIC_` prefix.
