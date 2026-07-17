CREATE TYPE "public"."automation_job_priority" AS ENUM('critical', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."automation_job_status" AS ENUM('queued', 'running', 'awaiting_user', 'succeeded', 'partial', 'failed', 'dead_letter', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."automation_job_type" AS ENUM('competitor_discovery', 'competitor_scrape', 'shipment_tracking');--> statement-breakpoint
CREATE TYPE "public"."provider_result_status" AS ENUM('succeeded', 'no_data', 'captcha', 'blocked', 'failed');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('pending', 'info_received', 'in_transit', 'customs', 'out_for_delivery', 'delivered', 'exception', 'returned', 'unknown');--> statement-breakpoint
CREATE TABLE "automation_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"provider" text,
	"kind" text NOT NULL,
	"storage_key" text,
	"sanitized_snapshot" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_job_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"event" text NOT NULL,
	"message" text NOT NULL,
	"progress" integer,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "automation_job_type" NOT NULL,
	"priority" "automation_job_priority" DEFAULT 'normal' NOT NULL,
	"status" "automation_job_status" DEFAULT 'queued' NOT NULL,
	"payload_json" jsonb NOT NULL,
	"result_json" jsonb,
	"progress_json" jsonb,
	"error_code" text,
	"error_summary" text,
	"dedupe_key" text,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"lease_owner" text,
	"lease_token" uuid,
	"leased_until" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"input_version" integer DEFAULT 1 NOT NULL,
	"result_version" integer DEFAULT 1 NOT NULL,
	"executor_version" text DEFAULT 'automation-core-v1' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"shipment_id" uuid,
	"channel" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_summary" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"state" text DEFAULT 'unknown' NOT NULL,
	"success_rate" numeric(5, 4) DEFAULT '0' NOT NULL,
	"captcha_rate" numeric(5, 4) DEFAULT '0' NOT NULL,
	"avg_duration_ms" integer,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"disabled_until" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"job_id" uuid,
	"status" "shipment_status" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"carrier" text,
	"provider" text,
	"event_at" timestamp with time zone,
	"event_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_provider_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" "provider_result_status" NOT NULL,
	"normalized_json" jsonb,
	"confidence" numeric(5, 4),
	"error_code" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_update_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"requested_by" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tracking_number" text NOT NULL,
	"display_name" text,
	"carrier_hint" text,
	"origin_country" text,
	"destination_country" text,
	"tracking_enabled" boolean DEFAULT true NOT NULL,
	"current_status" "shipment_status" DEFAULT 'pending' NOT NULL,
	"previous_status" "shipment_status",
	"status_title" text,
	"status_description" text,
	"last_location" text,
	"last_carrier" text,
	"confidence" numeric(5, 4),
	"last_checked_at" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"next_check_at" timestamp with time zone DEFAULT now(),
	"delivered_at" timestamp with time zone,
	"check_interval_minutes" integer DEFAULT 360 NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_artifacts" ADD CONSTRAINT "automation_artifacts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_artifacts" ADD CONSTRAINT "automation_artifacts_job_id_automation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."automation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_job_events" ADD CONSTRAINT "automation_job_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_job_events" ADD CONSTRAINT "automation_job_events_job_id_automation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."automation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_health" ADD CONSTRAINT "provider_health_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_job_id_automation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."automation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_provider_results" ADD CONSTRAINT "shipment_provider_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_provider_results" ADD CONSTRAINT "shipment_provider_results_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_provider_results" ADD CONSTRAINT "shipment_provider_results_job_id_automation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."automation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_update_requests" ADD CONSTRAINT "shipment_update_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_update_requests" ADD CONSTRAINT "shipment_update_requests_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_update_requests" ADD CONSTRAINT "shipment_update_requests_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_job_events_job_time_idx" ON "automation_job_events" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_jobs_claim_idx" ON "automation_jobs" USING btree ("status","scheduled_at","priority","created_at");--> statement-breakpoint
CREATE INDEX "automation_jobs_org_created_idx" ON "automation_jobs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_jobs_lease_idx" ON "automation_jobs" USING btree ("status","leased_until");--> statement-breakpoint
CREATE INDEX "automation_jobs_dedupe_idx" ON "automation_jobs" USING btree ("org_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_org_dedupe_unique" ON "notification_deliveries" USING btree ("org_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_health_org_provider_unique" ON "provider_health" USING btree ("org_id","provider");--> statement-breakpoint
CREATE INDEX "shipment_events_shipment_time_idx" ON "shipment_events" USING btree ("shipment_id","event_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_events_shipment_hash_unique" ON "shipment_events" USING btree ("shipment_id","event_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_provider_results_job_provider_unique" ON "shipment_provider_results" USING btree ("job_id","provider");--> statement-breakpoint
CREATE INDEX "shipment_provider_results_shipment_created_idx" ON "shipment_provider_results" USING btree ("shipment_id","created_at");--> statement-breakpoint
CREATE INDEX "shipment_update_requests_pending_idx" ON "shipment_update_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_org_tracking_unique" ON "shipments" USING btree ("org_id","tracking_number");--> statement-breakpoint
CREATE INDEX "shipments_org_next_check_idx" ON "shipments" USING btree ("org_id","tracking_enabled","next_check_at");--> statement-breakpoint
CREATE INDEX "shipments_org_status_idx" ON "shipments" USING btree ("org_id","current_status");
