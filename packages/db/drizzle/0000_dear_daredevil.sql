CREATE TYPE "public"."alert_type" AS ENUM('competitor_cheaper_than_me', 'price_drop_pct', 'price_rise_pct', 'back_in_stock', 'out_of_stock', 'my_price_above_market_pct');--> statement-breakpoint
CREATE TYPE "public"."availability" AS ENUM('in_stock', 'out_of_stock', 'preorder', 'limited', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."export_kind" AS ENUM('snapshots_csv', 'products_csv', 'matches_csv', 'analytics_xlsx', 'product_intelligence_csv', 'product_intelligence_json', 'product_history_csv');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('queued', 'running', 'ready', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."match_method" AS ENUM('manual', 'sku', 'gtin', 'title_similarity', 'brand_model');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('suggested', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."notif_channel" AS ENUM('in_app', 'email', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."notif_status" AS ENUM('pending', 'sent', 'failed', 'read');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'manager', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."scrape_strategy" AS ENUM('cheerio', 'playwright', 'manual', 'csv_import');--> statement-breakpoint
CREATE TYPE "public"."snapshot_status" AS ENUM('ok', 'parse_failed', 'blocked', 'captcha', 'suspicious', 'http_error', 'skipped_robots');--> statement-breakpoint
CREATE TYPE "public"."store_status" AS ENUM('active', 'paused', 'error');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "org_role" NOT NULL,
	"token" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"crawl_budget_minutes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"framework" text,
	"rendering_strategy" text,
	"scrape_difficulty" text,
	"anti_bot_risk" text,
	"recommended_mode" text,
	"detection_confidence" numeric(5, 4),
	"auto_detected_settings_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scraping_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"title_selector" text,
	"price_selector" text,
	"old_price_selector" text,
	"availability_selector" text,
	"image_selector" text,
	"brand_selector" text,
	"sku_selector" text,
	"breadcrumbs_selector" text,
	"product_card_selector" text,
	"card_title_selector" text,
	"card_price_selector" text,
	"card_old_price_selector" text,
	"card_image_selector" text,
	"card_link_selector" text,
	"card_availability_selector" text,
	"pagination_next_selector" text,
	"load_more_selector" text,
	"shipping_selector" text,
	"rating_selector" text,
	"price_regex" text,
	"use_json_ld" boolean DEFAULT true NOT NULL,
	"use_open_graph" boolean DEFAULT true NOT NULL,
	"custom_user_agent" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"country_code" text NOT NULL,
	"currency" text NOT NULL,
	"crawl_frequency_minutes" integer DEFAULT 1440 NOT NULL,
	"crawl_delay_seconds" integer DEFAULT 5 NOT NULL,
	"respect_robots" boolean DEFAULT true NOT NULL,
	"js_required" boolean DEFAULT false NOT NULL,
	"status" "store_status" DEFAULT 'active' NOT NULL,
	"robots_txt_status" text,
	"robots_txt_checked_at" timestamp with time zone,
	"last_health_check_at" timestamp with time zone,
	"last_successful_scrape_at" timestamp with time zone,
	"error_rate_24h" numeric(5, 4),
	"avg_response_ms" integer,
	"discovery_preset" text,
	"discovery_defaults_json" jsonb,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"external_id" text,
	"title" text,
	"brand" text,
	"sku" text,
	"gtin" text,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_scraped_at" timestamp with time zone,
	"last_change_at" timestamp with time zone,
	"next_run_at" timestamp with time zone DEFAULT now(),
	"selector_failure_count" integer DEFAULT 0 NOT NULL,
	"last_snapshot_price" numeric(12, 2),
	"last_snapshot_currency" text,
	"last_snapshot_availability" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "my_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"gtin" text,
	"brand" text,
	"name" text NOT NULL,
	"category_id" uuid,
	"my_price" numeric(12, 2),
	"currency" text NOT NULL,
	"url" text,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "normalized_product_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"normalized_product_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"alias_key" text NOT NULL,
	"source" text DEFAULT 'heuristic' NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0.750' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "normalized_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"canonical_title" text NOT NULL,
	"normalized_key" text NOT NULL,
	"brand" text,
	"category_id" uuid,
	"image_url" text,
	"confidence" numeric(4, 3) DEFAULT '0.750' NOT NULL,
	"source" text DEFAULT 'heuristic' NOT NULL,
	"manually_reviewed" boolean DEFAULT false NOT NULL,
	"duplicate_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_availability_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"normalized_product_id" uuid NOT NULL,
	"bucket_date" date NOT NULL,
	"in_stock_count" integer DEFAULT 0 NOT NULL,
	"out_of_stock_count" integer DEFAULT 0 NOT NULL,
	"unknown_count" integer DEFAULT 0 NOT NULL,
	"stock_ratio" numeric(6, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_insights_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"insight_type" text NOT NULL,
	"entity_id" text,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metric_value" numeric(14, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_matching_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"normalized_product_id" uuid,
	"my_product_id" uuid,
	"competitor_product_id" uuid,
	"action" text NOT NULL,
	"method" text NOT NULL,
	"score" numeric(5, 3),
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"normalized_product_id" uuid NOT NULL,
	"bucket_date" date NOT NULL,
	"min_price" numeric(12, 2),
	"avg_price" numeric(12, 2),
	"max_price" numeric(12, 2),
	"currency" text,
	"competitors_count" integer DEFAULT 0 NOT NULL,
	"volatility_score" numeric(8, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_specifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"normalized_product_id" uuid NOT NULL,
	"brand" text,
	"model" text,
	"year" integer,
	"motor" text,
	"battery" text,
	"battery_wh" integer,
	"fork" text,
	"rear_shock" text,
	"drivetrain" text,
	"brakes" text,
	"wheels" text,
	"wheel_size" text,
	"frame_material" text,
	"weight_kg" numeric(6, 2),
	"travel_mm" integer,
	"color" text,
	"size" text,
	"gender" text,
	"bike_type" text,
	"raw_specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0.650' NOT NULL,
	"source" text DEFAULT 'heuristic' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"competitor_product_id" uuid NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"price" numeric(12, 2),
	"old_price" numeric(12, 2),
	"currency" text,
	"availability" "availability",
	"stock_text" text,
	"shipping_text" text,
	"rating" numeric(3, 2),
	"title" text,
	"image_url" text,
	"status" "snapshot_status" DEFAULT 'ok' NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '1' NOT NULL,
	"source" "scrape_strategy" NOT NULL,
	"source_path" text,
	"http_status" integer,
	"duration_ms" integer,
	"raw_html_storage_key" text,
	"scrape_run_id" uuid,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"store_id" uuid,
	"triggered_by" text DEFAULT 'scheduler' NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"products_total" integer DEFAULT 0 NOT NULL,
	"products_ok" integer DEFAULT 0 NOT NULL,
	"products_failed" integer DEFAULT 0 NOT NULL,
	"error_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"my_product_id" uuid NOT NULL,
	"competitor_product_id" uuid NOT NULL,
	"method" "match_method" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"status" "match_status" DEFAULT 'suggested' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "alert_type" NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scope_my_product_id" uuid,
	"scope_competitor_product_id" uuid,
	"scope_store_id" uuid,
	"channels" "notif_channel"[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"alert_rule_id" uuid,
	"user_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb,
	"channel" "notif_channel" NOT NULL,
	"status" "notif_status" DEFAULT 'pending' NOT NULL,
	"dedup_key" text,
	"read_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "export_kind" NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "export_status" DEFAULT 'queued' NOT NULL,
	"storage_key" text,
	"row_count" text,
	"error_message" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_extraction_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"competitor_id" uuid,
	"url" text NOT NULL,
	"cleaned_dom_hash" text NOT NULL,
	"suggested_rules_json" jsonb NOT NULL,
	"confidence" numeric(4, 3),
	"status" text DEFAULT 'suggested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"latency_ms" integer,
	"token_estimate" integer,
	"success" boolean DEFAULT false NOT NULL,
	"confidence" numeric(4, 3),
	"cache_hit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"storage_state" text NOT NULL,
	"cookies_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_scraping_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"competitor_id" uuid,
	"url" text NOT NULL,
	"status" text DEFAULT 'waiting_for_manual_action' NOT NULL,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"storage_state" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_discovery_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"path" text,
	"breadcrumbs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"product_count_estimate" integer,
	"products_found" integer DEFAULT 0 NOT NULL,
	"pagination_pages_found" integer DEFAULT 0 NOT NULL,
	"confidence" numeric(4, 3),
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_discovery_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"context_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_discovery_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"canonical_url" text,
	"page_type" text NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"depth" integer DEFAULT 0 NOT NULL,
	"parent_url" text,
	"title" text,
	"h1" text,
	"confidence" numeric(4, 3),
	"discovered_from" text,
	"crawled_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "site_discovery_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"category_id" uuid,
	"url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"title" text,
	"price" numeric(12, 2),
	"old_price" numeric(12, 2),
	"currency" text,
	"availability" text,
	"image_url" text,
	"brand" text,
	"sku" text,
	"ean" text,
	"gtin" text,
	"rating" numeric(3, 2),
	"shipping" text,
	"category_path" text,
	"breadcrumbs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_card_json" jsonb,
	"raw_detail_json" jsonb,
	"confidence" numeric(4, 3),
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_discovery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"start_url" text NOT NULL,
	"max_pages" integer DEFAULT 300 NOT NULL,
	"max_products" integer DEFAULT 1000 NOT NULL,
	"crawl_depth" integer DEFAULT 4 NOT NULL,
	"mode" text DEFAULT 'category_scan' NOT NULL,
	"use_ai" boolean DEFAULT false NOT NULL,
	"use_manual_captcha" boolean DEFAULT true NOT NULL,
	"respect_robots_txt" boolean DEFAULT true NOT NULL,
	"js_required" boolean DEFAULT false NOT NULL,
	"include_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exclude_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pages_discovered" integer DEFAULT 0 NOT NULL,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"categories_found" integer DEFAULT 0 NOT NULL,
	"products_found" integer DEFAULT 0 NOT NULL,
	"errors_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "analytics_daily_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"bucket_date" date NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_daily_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"category_id" uuid,
	"category_name" text NOT NULL,
	"bucket_date" date NOT NULL,
	"products_count" integer DEFAULT 0 NOT NULL,
	"avg_price" numeric(12, 2),
	"volatility_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_daily_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"bucket_date" date NOT NULL,
	"products_count" integer DEFAULT 0 NOT NULL,
	"avg_price" numeric(12, 2),
	"avg_discount" numeric(8, 2),
	"aggressiveness_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"data_quality_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_daily_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid,
	"entity_key" text NOT NULL,
	"bucket_date" date NOT NULL,
	"min_price" numeric(12, 2),
	"avg_price" numeric(12, 2),
	"max_price" numeric(12, 2),
	"stock_ratio" numeric(6, 3),
	"volatility_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_profiles" ADD CONSTRAINT "competitor_profiles_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraping_rules" ADD CONSTRAINT "scraping_rules_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_products" ADD CONSTRAINT "competitor_products_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_products" ADD CONSTRAINT "competitor_products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_products" ADD CONSTRAINT "competitor_products_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "my_products" ADD CONSTRAINT "my_products_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "my_products" ADD CONSTRAINT "my_products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "my_products" ADD CONSTRAINT "my_products_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_product_aliases" ADD CONSTRAINT "normalized_product_aliases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_product_aliases" ADD CONSTRAINT "normalized_product_aliases_normalized_product_id_normalized_products_id_fk" FOREIGN KEY ("normalized_product_id") REFERENCES "public"."normalized_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_products" ADD CONSTRAINT "normalized_products_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_products" ADD CONSTRAINT "normalized_products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_availability_history" ADD CONSTRAINT "product_availability_history_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_availability_history" ADD CONSTRAINT "product_availability_history_normalized_product_id_normalized_products_id_fk" FOREIGN KEY ("normalized_product_id") REFERENCES "public"."normalized_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_insights_cache" ADD CONSTRAINT "product_insights_cache_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_matching_logs" ADD CONSTRAINT "product_matching_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_matching_logs" ADD CONSTRAINT "product_matching_logs_normalized_product_id_normalized_products_id_fk" FOREIGN KEY ("normalized_product_id") REFERENCES "public"."normalized_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_matching_logs" ADD CONSTRAINT "product_matching_logs_my_product_id_my_products_id_fk" FOREIGN KEY ("my_product_id") REFERENCES "public"."my_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_matching_logs" ADD CONSTRAINT "product_matching_logs_competitor_product_id_competitor_products_id_fk" FOREIGN KEY ("competitor_product_id") REFERENCES "public"."competitor_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_normalized_product_id_normalized_products_id_fk" FOREIGN KEY ("normalized_product_id") REFERENCES "public"."normalized_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_normalized_product_id_normalized_products_id_fk" FOREIGN KEY ("normalized_product_id") REFERENCES "public"."normalized_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_competitor_product_id_competitor_products_id_fk" FOREIGN KEY ("competitor_product_id") REFERENCES "public"."competitor_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_scrape_run_id_scrape_runs_id_fk" FOREIGN KEY ("scrape_run_id") REFERENCES "public"."scrape_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_matches" ADD CONSTRAINT "product_matches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_matches" ADD CONSTRAINT "product_matches_my_product_id_my_products_id_fk" FOREIGN KEY ("my_product_id") REFERENCES "public"."my_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_matches" ADD CONSTRAINT "product_matches_competitor_product_id_competitor_products_id_fk" FOREIGN KEY ("competitor_product_id") REFERENCES "public"."competitor_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_matches" ADD CONSTRAINT "product_matches_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_scope_my_product_id_my_products_id_fk" FOREIGN KEY ("scope_my_product_id") REFERENCES "public"."my_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_scope_competitor_product_id_competitor_products_id_fk" FOREIGN KEY ("scope_competitor_product_id") REFERENCES "public"."competitor_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_scope_store_id_stores_id_fk" FOREIGN KEY ("scope_store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alert_rule_id_alert_rules_id_fk" FOREIGN KEY ("alert_rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_extraction_suggestions" ADD CONSTRAINT "ai_extraction_suggestions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_extraction_suggestions" ADD CONSTRAINT "ai_extraction_suggestions_competitor_id_stores_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_scraping_sessions" ADD CONSTRAINT "manual_scraping_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_scraping_sessions" ADD CONSTRAINT "manual_scraping_sessions_competitor_id_stores_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_discovery_categories" ADD CONSTRAINT "site_discovery_categories_run_id_site_discovery_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."site_discovery_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_discovery_categories" ADD CONSTRAINT "site_discovery_categories_competitor_id_stores_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_discovery_logs" ADD CONSTRAINT "site_discovery_logs_run_id_site_discovery_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."site_discovery_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_discovery_pages" ADD CONSTRAINT "site_discovery_pages_run_id_site_discovery_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."site_discovery_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_discovery_products" ADD CONSTRAINT "site_discovery_products_run_id_site_discovery_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."site_discovery_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_discovery_products" ADD CONSTRAINT "site_discovery_products_competitor_id_stores_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_discovery_products" ADD CONSTRAINT "site_discovery_products_category_id_site_discovery_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."site_discovery_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_discovery_runs" ADD CONSTRAINT "site_discovery_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_discovery_runs" ADD CONSTRAINT "site_discovery_runs_competitor_id_stores_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_discovery_runs" ADD CONSTRAINT "site_discovery_runs_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_daily_rollups" ADD CONSTRAINT "analytics_daily_rollups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_daily_rollups" ADD CONSTRAINT "category_daily_rollups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_daily_rollups" ADD CONSTRAINT "category_daily_rollups_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_daily_rollups" ADD CONSTRAINT "competitor_daily_rollups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_daily_rollups" ADD CONSTRAINT "competitor_daily_rollups_competitor_id_stores_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_daily_rollups" ADD CONSTRAINT "product_daily_rollups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_daily_rollups" ADD CONSTRAINT "product_daily_rollups_product_id_my_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."my_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_unique" ON "invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invitations_org_email_idx" ON "invitations" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_org_slug_unique" ON "categories" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "categories_org_parent_idx" ON "categories" USING btree ("org_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_org_name_unique" ON "tags" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_profiles_store_unique" ON "competitor_profiles" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "competitor_profiles_framework_idx" ON "competitor_profiles" USING btree ("framework");--> statement-breakpoint
CREATE UNIQUE INDEX "scraping_rules_store_unique" ON "scraping_rules" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_org_domain_unique" ON "stores" USING btree ("org_id","domain");--> statement-breakpoint
CREATE INDEX "stores_org_status_idx" ON "stores" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_products_store_url_unique" ON "competitor_products" USING btree ("store_id","url_hash");--> statement-breakpoint
CREATE INDEX "competitor_products_next_run_idx" ON "competitor_products" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "competitor_products_org_store_idx" ON "competitor_products" USING btree ("org_id","store_id");--> statement-breakpoint
CREATE INDEX "competitor_products_org_active_idx" ON "competitor_products" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "competitor_products_org_last_scraped_idx" ON "competitor_products" USING btree ("org_id","last_scraped_at");--> statement-breakpoint
CREATE UNIQUE INDEX "my_products_org_sku_unique" ON "my_products" USING btree ("org_id","sku");--> statement-breakpoint
CREATE INDEX "my_products_org_active_idx" ON "my_products" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "my_products_org_gtin_idx" ON "my_products" USING btree ("org_id","gtin");--> statement-breakpoint
CREATE INDEX "my_products_org_category_idx" ON "my_products" USING btree ("org_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_product_aliases_org_alias_unique" ON "normalized_product_aliases" USING btree ("org_id","alias_key");--> statement-breakpoint
CREATE INDEX "normalized_product_aliases_product_idx" ON "normalized_product_aliases" USING btree ("normalized_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_products_org_key_unique" ON "normalized_products" USING btree ("org_id","normalized_key");--> statement-breakpoint
CREATE INDEX "normalized_products_org_brand_idx" ON "normalized_products" USING btree ("org_id","brand");--> statement-breakpoint
CREATE INDEX "normalized_products_org_category_idx" ON "normalized_products" USING btree ("org_id","category_id");--> statement-breakpoint
CREATE INDEX "normalized_products_org_updated_idx" ON "normalized_products" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_availability_history_product_date_unique" ON "product_availability_history" USING btree ("normalized_product_id","bucket_date");--> statement-breakpoint
CREATE INDEX "product_availability_history_org_date_idx" ON "product_availability_history" USING btree ("org_id","bucket_date");--> statement-breakpoint
CREATE INDEX "product_insights_cache_org_type_idx" ON "product_insights_cache" USING btree ("org_id","insight_type");--> statement-breakpoint
CREATE INDEX "product_insights_cache_org_severity_idx" ON "product_insights_cache" USING btree ("org_id","severity");--> statement-breakpoint
CREATE INDEX "product_matching_logs_org_created_idx" ON "product_matching_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "product_matching_logs_competitor_idx" ON "product_matching_logs" USING btree ("competitor_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_price_history_product_date_unique" ON "product_price_history" USING btree ("normalized_product_id","bucket_date");--> statement-breakpoint
CREATE INDEX "product_price_history_org_date_idx" ON "product_price_history" USING btree ("org_id","bucket_date");--> statement-breakpoint
CREATE UNIQUE INDEX "product_specifications_product_unique" ON "product_specifications" USING btree ("normalized_product_id");--> statement-breakpoint
CREATE INDEX "product_specifications_org_battery_idx" ON "product_specifications" USING btree ("org_id","battery_wh");--> statement-breakpoint
CREATE INDEX "product_specifications_org_wheel_idx" ON "product_specifications" USING btree ("org_id","wheel_size");--> statement-breakpoint
CREATE INDEX "price_snapshots_product_time_idx" ON "price_snapshots" USING btree ("competitor_product_id","scraped_at");--> statement-breakpoint
CREATE INDEX "price_snapshots_org_time_idx" ON "price_snapshots" USING btree ("org_id","scraped_at");--> statement-breakpoint
CREATE INDEX "price_snapshots_org_status_time_idx" ON "price_snapshots" USING btree ("org_id","status","scraped_at");--> statement-breakpoint
CREATE INDEX "price_snapshots_run_idx" ON "price_snapshots" USING btree ("scrape_run_id");--> statement-breakpoint
CREATE INDEX "scrape_runs_org_created_idx" ON "scrape_runs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "scrape_runs_org_status_created_idx" ON "scrape_runs" USING btree ("org_id","status","created_at");--> statement-breakpoint
CREATE INDEX "scrape_runs_store_created_idx" ON "scrape_runs" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_matches_pair_unique" ON "product_matches" USING btree ("my_product_id","competitor_product_id");--> statement-breakpoint
CREATE INDEX "product_matches_org_status_idx" ON "product_matches" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "product_matches_competitor_product_idx" ON "product_matches" USING btree ("competitor_product_id");--> statement-breakpoint
CREATE INDEX "alert_rules_org_active_idx" ON "alert_rules" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_org_created_idx" ON "notifications" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_dedup_idx" ON "notifications" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "exports_org_created_idx" ON "exports" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_extraction_suggestions_org_idx" ON "ai_extraction_suggestions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_extraction_suggestions_hash_idx" ON "ai_extraction_suggestions" USING btree ("cleaned_dom_hash");--> statement-breakpoint
CREATE INDEX "ai_logs_created_at_idx" ON "ai_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "domain_sessions_domain_idx" ON "domain_sessions" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "manual_scraping_sessions_org_idx" ON "manual_scraping_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "manual_scraping_sessions_status_idx" ON "manual_scraping_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "manual_scraping_sessions_org_status_created_idx" ON "manual_scraping_sessions" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "site_discovery_categories_run_url_unique" ON "site_discovery_categories" USING btree ("run_id","url");--> statement-breakpoint
CREATE INDEX "site_discovery_categories_run_idx" ON "site_discovery_categories" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "site_discovery_logs_run_created_idx" ON "site_discovery_logs" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "site_discovery_pages_run_url_unique" ON "site_discovery_pages" USING btree ("run_id","normalized_url");--> statement-breakpoint
CREATE INDEX "site_discovery_pages_run_type_idx" ON "site_discovery_pages" USING btree ("run_id","page_type");--> statement-breakpoint
CREATE UNIQUE INDEX "site_discovery_products_run_url_unique" ON "site_discovery_products" USING btree ("run_id","normalized_url");--> statement-breakpoint
CREATE INDEX "site_discovery_products_run_idx" ON "site_discovery_products" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "site_discovery_products_sku_idx" ON "site_discovery_products" USING btree ("run_id","sku");--> statement-breakpoint
CREATE INDEX "site_discovery_products_gtin_idx" ON "site_discovery_products" USING btree ("run_id","gtin");--> statement-breakpoint
CREATE INDEX "site_discovery_runs_org_created_idx" ON "site_discovery_runs" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "site_discovery_runs_org_status_created_idx" ON "site_discovery_runs" USING btree ("organization_id","status","started_at");--> statement-breakpoint
CREATE INDEX "site_discovery_runs_competitor_idx" ON "site_discovery_runs" USING btree ("competitor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_daily_rollups_org_date_unique" ON "analytics_daily_rollups" USING btree ("org_id","bucket_date");--> statement-breakpoint
CREATE UNIQUE INDEX "category_daily_rollups_category_date_unique" ON "category_daily_rollups" USING btree ("org_id","category_name","bucket_date");--> statement-breakpoint
CREATE INDEX "category_daily_rollups_org_date_idx" ON "category_daily_rollups" USING btree ("org_id","bucket_date");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_daily_rollups_competitor_date_unique" ON "competitor_daily_rollups" USING btree ("competitor_id","bucket_date");--> statement-breakpoint
CREATE INDEX "competitor_daily_rollups_org_date_idx" ON "competitor_daily_rollups" USING btree ("org_id","bucket_date");--> statement-breakpoint
CREATE UNIQUE INDEX "product_daily_rollups_product_date_unique" ON "product_daily_rollups" USING btree ("org_id","entity_key","bucket_date");--> statement-breakpoint
CREATE INDEX "product_daily_rollups_org_date_idx" ON "product_daily_rollups" USING btree ("org_id","bucket_date");