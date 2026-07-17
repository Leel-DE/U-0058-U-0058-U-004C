ALTER TABLE "shipments" ADD COLUMN "respect_robots_txt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "force_javascript" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "use_ai" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "use_manual_captcha" boolean DEFAULT true NOT NULL;