CREATE TYPE "public"."flash_sale_status" AS ENUM('scheduled', 'active', 'ended', 'cancelled');--> statement-breakpoint
CREATE TABLE "flash_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"original_discount" integer NOT NULL,
	"flash_discount" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "flash_sale_status" DEFAULT 'scheduled' NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"revenue_total" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"handle" varchar(100),
	"avatar_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "session_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"platforms" jsonb,
	"default_offer_ids" jsonb,
	"default_product_ids" jsonb,
	"settings" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "variants_external_idx";--> statement-breakpoint
DROP INDEX "products_connection_external_idx";--> statement-breakpoint
ALTER TABLE "flash_sales" ADD CONSTRAINT "flash_sales_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_sales" ADD CONSTRAINT "flash_sales_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_templates" ADD CONSTRAINT "session_templates_creator_id_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flash_sales_creator_idx" ON "flash_sales" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "flash_sales_offer_idx" ON "flash_sales" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "flash_sales_status_idx" ON "flash_sales" USING btree ("status");--> statement-breakpoint
CREATE INDEX "flash_sales_ends_at_idx" ON "flash_sales" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "session_templates_creator_idx" ON "session_templates" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "session_templates_is_default_idx" ON "session_templates" USING btree ("is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_product_external_idx" ON "variants" USING btree ("product_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_connection_external_idx" ON "products" USING btree ("connection_id","external_id");