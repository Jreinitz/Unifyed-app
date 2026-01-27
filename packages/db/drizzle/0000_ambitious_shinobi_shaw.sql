CREATE TYPE "public"."surface_type" AS ENUM('live', 'replay', 'clip', 'link_in_bio', 'dm', 'agent', 'direct');--> statement-breakpoint
CREATE TYPE "public"."checkout_status" AS ENUM('pending', 'redirected', 'completed', 'abandoned', 'failed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'fulfilled', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."event_processing_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('healthy', 'degraded', 'disconnected', 'pending');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('shopify', 'tiktok', 'youtube', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('draft', 'active', 'paused', 'expired', 'archived');--> statement-breakpoint
CREATE TYPE "public"."offer_type" AS ENUM('percentage_off', 'fixed_amount_off', 'fixed_price', 'bundle');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'confirmed', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "public"."stream_source" AS ENUM('auto_detected', 'manual');--> statement-breakpoint
CREATE TYPE "public"."stream_status" AS ENUM('scheduled', 'live', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."video_source" AS ENUM('platform_import', 'manual_url', 'uploaded');--> statement-breakpoint
CREATE TABLE "attribution_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"platform" "platform",
	"platform_connection_id" uuid,
	"surface" "surface_type" NOT NULL,
	"stream_id" uuid,
	"replay_id" uuid,
	"moment_id" uuid,
	"platform_stream_id" varchar(255),
	"platform_video_id" varchar(255),
	"campaign" varchar(255),
	"source" varchar(255),
	"medium" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"short_link_id" uuid,
	"attribution_context_id" uuid NOT NULL,
	"offer_id" uuid,
	"connection_id" uuid NOT NULL,
	"external_checkout_id" varchar(255),
	"external_checkout_url" text,
	"status" "checkout_status" DEFAULT 'pending' NOT NULL,
	"cart_items" jsonb NOT NULL,
	"subtotal" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"visitor_id" varchar(255),
	"user_agent" text,
	"ip_address" varchar(45),
	"redirected_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_sessions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"checkout_session_id" uuid,
	"attribution_context_id" uuid,
	"connection_id" uuid NOT NULL,
	"external_order_id" varchar(255) NOT NULL,
	"external_order_number" varchar(100),
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"subtotal" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"shipping" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"customer_email" varchar(255),
	"customer_name" varchar(255),
	"line_items" jsonb,
	"raw_payload" jsonb,
	"external_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"handle" varchar(100),
	"avatar_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creators_email_unique" UNIQUE("email"),
	CONSTRAINT "creators_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"creator_id" uuid,
	"payload" jsonb NOT NULL,
	"processing_status" "event_processing_status" DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"processing_attempts" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_log_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "platform_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"credentials" text NOT NULL,
	"external_id" varchar(255),
	"display_name" varchar(255),
	"status" "connection_status" DEFAULT 'pending' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"token_expires_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"vendor" varchar(255),
	"product_type" varchar(255),
	"image_url" text,
	"images" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"source_metadata" jsonb,
	"last_synced_at" timestamp with time zone,
	"sync_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"sku" varchar(255),
	"barcode" varchar(255),
	"price" integer NOT NULL,
	"compare_at_price" integer,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"inventory_quantity" integer DEFAULT 0 NOT NULL,
	"inventory_policy" varchar(50) DEFAULT 'deny',
	"option1" varchar(255),
	"option2" varchar(255),
	"option3" varchar(255),
	"image_url" text,
	"weight" numeric(10, 2),
	"weight_unit" varchar(10) DEFAULT 'kg',
	"is_active" boolean DEFAULT true NOT NULL,
	"inventory_item_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"override_value" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" "offer_type" NOT NULL,
	"value" integer NOT NULL,
	"status" "offer_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_redemptions" integer,
	"current_redemptions" integer DEFAULT 0 NOT NULL,
	"max_per_customer" integer DEFAULT 1,
	"badge_text" varchar(50),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"available_quantity" integer NOT NULL,
	"reserved_quantity" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"checkout_session_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "reservation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"release_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"stream_id" uuid,
	"replay_id" uuid,
	"title" varchar(255) NOT NULL,
	"description" text,
	"timestamp" integer NOT NULL,
	"thumbnail_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"stream_id" uuid,
	"platform" "platform",
	"platform_connection_id" uuid,
	"platform_video_id" varchar(255),
	"video_source" "video_source" DEFAULT 'manual_url' NOT NULL,
	"video_url" text,
	"title" varchar(500),
	"description" text,
	"thumbnail_url" text,
	"duration" integer,
	"slug" varchar(100),
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "replays_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"platform" "platform",
	"platform_connection_id" uuid,
	"platform_stream_id" varchar(255),
	"source" "stream_source" DEFAULT 'manual' NOT NULL,
	"title" varchar(500),
	"description" text,
	"thumbnail_url" text,
	"status" "stream_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_start_at" timestamp with time zone,
	"actual_start_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"peak_viewers" integer,
	"total_views" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "short_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"offer_id" uuid NOT NULL,
	"attribution_context_id" uuid NOT NULL,
	"name" varchar(255),
	"expires_at" timestamp with time zone,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"max_clicks" integer,
	"click_count" integer DEFAULT 0 NOT NULL,
	"last_clicked_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "short_links_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "attribution_contexts" ADD CONSTRAINT "attribution_contexts_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_contexts" ADD CONSTRAINT "attribution_contexts_platform_connection_id_platform_connections_id_fk" FOREIGN KEY ("platform_connection_id") REFERENCES "public"."platform_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_attribution_context_id_attribution_contexts_id_fk" FOREIGN KEY ("attribution_context_id") REFERENCES "public"."attribution_contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_connection_id_platform_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."platform_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_attribution_context_id_attribution_contexts_id_fk" FOREIGN KEY ("attribution_context_id") REFERENCES "public"."attribution_contexts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_connection_id_platform_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."platform_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_log" ADD CONSTRAINT "event_log_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_connection_id_platform_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."platform_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_products" ADD CONSTRAINT "offer_products_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_products" ADD CONSTRAINT "offer_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_products" ADD CONSTRAINT "offer_products_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_replay_id_replays_id_fk" FOREIGN KEY ("replay_id") REFERENCES "public"."replays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_platform_connection_id_platform_connections_id_fk" FOREIGN KEY ("platform_connection_id") REFERENCES "public"."platform_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streams" ADD CONSTRAINT "streams_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streams" ADD CONSTRAINT "streams_platform_connection_id_platform_connections_id_fk" FOREIGN KEY ("platform_connection_id") REFERENCES "public"."platform_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_attribution_context_id_attribution_contexts_id_fk" FOREIGN KEY ("attribution_context_id") REFERENCES "public"."attribution_contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attribution_contexts_creator_idx" ON "attribution_contexts" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "attribution_contexts_surface_idx" ON "attribution_contexts" USING btree ("surface");--> statement-breakpoint
CREATE INDEX "attribution_contexts_stream_idx" ON "attribution_contexts" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "attribution_contexts_replay_idx" ON "attribution_contexts" USING btree ("replay_id");--> statement-breakpoint
CREATE INDEX "checkout_sessions_creator_idx" ON "checkout_sessions" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "checkout_sessions_status_idx" ON "checkout_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "checkout_sessions_short_link_idx" ON "checkout_sessions" USING btree ("short_link_id");--> statement-breakpoint
CREATE INDEX "checkout_sessions_external_checkout_idx" ON "checkout_sessions" USING btree ("external_checkout_id");--> statement-breakpoint
CREATE INDEX "checkout_sessions_expires_at_idx" ON "checkout_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "orders_creator_idx" ON "orders" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "orders_checkout_session_idx" ON "orders" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE INDEX "orders_attribution_context_idx" ON "orders" USING btree ("attribution_context_id");--> statement-breakpoint
CREATE INDEX "orders_external_order_idx" ON "orders" USING btree ("connection_id","external_order_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "event_log_event_type_idx" ON "event_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "event_log_creator_idx" ON "event_log" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "event_log_processing_status_idx" ON "event_log" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "event_log_occurred_at_idx" ON "event_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "platform_connections_creator_platform_idx" ON "platform_connections" USING btree ("creator_id","platform");--> statement-breakpoint
CREATE INDEX "platform_connections_status_idx" ON "platform_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_connection_external_idx" ON "products" USING btree ("connection_id","external_id");--> statement-breakpoint
CREATE INDEX "products_active_idx" ON "products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "variants_external_idx" ON "variants" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "variants_sku_idx" ON "variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "offer_products_offer_idx" ON "offer_products" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "offer_products_product_idx" ON "offer_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "offer_products_unique_idx" ON "offer_products" USING btree ("offer_id","product_id","variant_id");--> statement-breakpoint
CREATE INDEX "offers_creator_status_idx" ON "offers" USING btree ("creator_id","status");--> statement-breakpoint
CREATE INDEX "offers_status_idx" ON "offers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inventory_snapshots_variant_idx" ON "inventory_snapshots" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "inventory_snapshots_created_at_idx" ON "inventory_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reservations_variant_idx" ON "reservations" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "reservations_checkout_session_idx" ON "reservations" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE INDEX "reservations_status_idx" ON "reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reservations_expires_at_idx" ON "reservations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "moments_creator_idx" ON "moments" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "moments_stream_idx" ON "moments" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "moments_replay_idx" ON "moments" USING btree ("replay_id");--> statement-breakpoint
CREATE INDEX "replays_creator_idx" ON "replays" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "replays_stream_idx" ON "replays" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "replays_slug_idx" ON "replays" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "replays_platform_video_idx" ON "replays" USING btree ("platform_video_id");--> statement-breakpoint
CREATE INDEX "streams_creator_idx" ON "streams" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "streams_platform_stream_idx" ON "streams" USING btree ("platform_stream_id");--> statement-breakpoint
CREATE INDEX "streams_status_idx" ON "streams" USING btree ("status");--> statement-breakpoint
CREATE INDEX "short_links_code_idx" ON "short_links" USING btree ("code");--> statement-breakpoint
CREATE INDEX "short_links_creator_idx" ON "short_links" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "short_links_offer_idx" ON "short_links" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "short_links_expires_at_idx" ON "short_links" USING btree ("expires_at");