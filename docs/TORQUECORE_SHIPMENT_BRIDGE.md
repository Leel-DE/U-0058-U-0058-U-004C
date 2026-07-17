# TorqueCore shipment bridge

The bridge is intentionally thin: TorqueCore remains the remote request and presentation surface; Automation Hub owns browser execution.

## Configuration

Set server-side values in the local desktop runtime or encrypted Electron vault:

```text
TORQUECORE_SUPABASE_URL=
TORQUECORE_SUPABASE_SERVICE_ROLE_KEY=
TORQUECORE_AUTOMATION_ORG_ID=
TORQUECORE_BRIDGE_POLL_MS=10000
```

`TORQUECORE_AUTOMATION_ORG_ID` is optional on a single-organization installation. When omitted, the first local organization is used. It should be explicit in multi-organization deployments.

## Request flow

- TorqueCore creates a normal queued `shipment_tracking_runs` row from any authenticated admin device.
- The local tray application can be hidden, but the PC must be powered on, connected and running Automation Hub.
- The bridge imports the safe shipment identifier and tracking number, then creates a critical local typed job.
- Results are written back to the same TorqueCore run as `source_results` plus an AI/deterministic presentation.
- When no source confirms new data, the last confirmed shipment status is preserved.

TorqueCore does not run Playwright and does not receive local browser profiles, proxy credentials, screenshots, lease tokens, provider health internals or service logs.

## Telegram

Telegram is sent only for a real status transition into an important state. `notification_deliveries` prevents duplicate delivery for the same shipment and status. The user message contains one friendly result—status, tracking number, carrier/location when known, and a short explanation—not an aggregator-by-aggregator dump.
