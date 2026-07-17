# Automation Hub architecture

## Outcome

Competition Radar is now one domain inside a local-first Automation Hub. The Electron tray application owns the web control plane, Fastify worker and Inngest scheduler. Browser workloads from Competition and Shipments enter one typed Postgres queue and execute through one Playwright runtime.

## Runtime flow

1. A Server Action, Inngest schedule, adaptive shipment schedule or TorqueCore bridge creates an allowlisted `automation_jobs` row.
2. `claim_automation_job` atomically orders eligible work by aged priority, locks it with `FOR UPDATE SKIP LOCKED`, and issues a short lease token.
3. `RuntimeSupervisor` validates the versioned payload and resolves one of three registered handlers: `competitor_discovery`, `competitor_scrape`, or `shipment_tracking`.
4. `BrowserJobExecutor` creates a context from the shared `BrowserLauncher` and `BrowserContextManager`. No job payload can select a URL, handler, JavaScript snippet, shell command or filesystem path.
5. The handler emits durable events and renews its lease. Cookie consent is accepted; onboarding and other blocking dialogs are dismissed; CAPTCHA changes the workflow state instead of being bypassed.
6. Typed normalized results are persisted idempotently. Shipment events use a stable hash, notifications use a dedupe key, and active jobs use a partial unique dedupe index.
7. Completed TorqueCore work is copied back as a safe presentation. The TorqueCore browser UI never receives worker credentials, leases, provider telemetry or raw artifacts.

## Shared browser components

- `BrowserLauncher`: one real browser process, adaptive headed/headless mode and optional proxy.
- `BrowserContextManager`: isolated contexts, bounded concurrency and deterministic cleanup.
- `PersistentProfileManager`: safe profile path allocation for manual continuation extensions.
- `BrowserJobExecutor`: strict handler registry and payload validation.
- `CookieBannerHandler`, `PopupHandler`, `CaptchaHandler`: reusable page preparation.
- `RetryManager`, `ScreenshotService`, `SnapshotService`, `ReportBuilder`: bounded reliability and diagnostics primitives.
- `JobLeaseManager`, `RuntimeLogger`, `RuntimeSupervisor`, `GracefulShutdownManager`: durable lifecycle.
- `NotificationService`, `OpenAIProcessingService`: optional presentation and important-change delivery.

## Data boundary

Safe member-readable tables are `shipments`, `shipment_events`, `shipment_provider_results`, `provider_health`, `automation_jobs`, and `automation_job_events`. Queue lifecycle and result writes have no authenticated write policy and are performed only through the service role. `shipment_update_requests` is the narrow authenticated request boundary; a member may insert a request only for themselves. `automation_artifacts` is owner-readable and worker-written.

`shipment_tracking_public` is the safe normalized view intended for browser clients. Service credentials, lease tokens, raw browser storage, notification receipts and internal artifacts are never projected by it.

## Scheduling and capacity

- Default browser concurrency: `1`.
- Queue polling: `3 seconds`.
- Lease: `120 seconds`, renewed by heartbeat.
- Priority: critical, high, normal, low with six-hour aging to prevent starvation.
- Shipment schedule: 30 minutes when out for delivery; 60 minutes for customs/exception; 3 hours in transit; 6 hours after registration; 12 hours without confirmed data; terminal shipments stop hot polling.
- Five consecutive provider failures open a 30-minute circuit breaker.

## Extension points

Supplier monitoring and SEO automation should add a domain module, a versioned Zod payload, a registered handler, normalized result storage and RLS policy. They must not add a second Playwright launcher or arbitrary-execution fields to the generic job envelope.
