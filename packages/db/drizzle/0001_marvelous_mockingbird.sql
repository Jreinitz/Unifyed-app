CREATE TYPE "public"."streaming_tool" AS ENUM('restream', 'streamyard', 'obs');--> statement-breakpoint
CREATE TYPE "public"."streaming_tool_status" AS ENUM('connected', 'disconnected', 'pending', 'error');--> statement-breakpoint
CREATE TYPE "public"."live_session_status" AS ENUM('preparing', 'live', 'ending', 'ended');--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'twitch';--> statement-breakpoint
CREATE TABLE "streaming_tool_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"tool" "streaming_tool" NOT NULL,
	"credentials" text NOT NULL,
	"external_id" varchar(255),
	"display_name" varchar(255),
	"status" "streaming_tool_status" DEFAULT 'pending' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"token_expires_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streaming_tool_connections_creator_tool_unique" UNIQUE("creator_id","tool")
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" varchar(500),
	"description" text,
	"status" "live_session_status" DEFAULT 'preparing' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"total_peak_viewers" integer,
	"total_views" integer,
	"views_by_platform" jsonb,
	"streaming_tool_connection_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attribution_contexts" ADD COLUMN "live_session_id" uuid;--> statement-breakpoint
ALTER TABLE "streams" ADD COLUMN "live_session_id" uuid;--> statement-breakpoint
ALTER TABLE "streaming_tool_connections" ADD CONSTRAINT "streaming_tool_connections_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_streaming_tool_connection_id_streaming_tool_connections_id_fk" FOREIGN KEY ("streaming_tool_connection_id") REFERENCES "public"."streaming_tool_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "streaming_tool_connections_creator_tool_idx" ON "streaming_tool_connections" USING btree ("creator_id","tool");--> statement-breakpoint
CREATE INDEX "streaming_tool_connections_status_idx" ON "streaming_tool_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "live_sessions_creator_idx" ON "live_sessions" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "live_sessions_status_idx" ON "live_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "live_sessions_started_at_idx" ON "live_sessions" USING btree ("started_at");--> statement-breakpoint
ALTER TABLE "attribution_contexts" ADD CONSTRAINT "attribution_contexts_live_session_id_live_sessions_id_fk" FOREIGN KEY ("live_session_id") REFERENCES "public"."live_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streams" ADD CONSTRAINT "streams_live_session_id_live_sessions_id_fk" FOREIGN KEY ("live_session_id") REFERENCES "public"."live_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attribution_contexts_live_session_idx" ON "attribution_contexts" USING btree ("live_session_id");--> statement-breakpoint
CREATE INDEX "streams_live_session_idx" ON "streams" USING btree ("live_session_id");--> statement-breakpoint
ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_creator_platform_unique" UNIQUE("creator_id","platform");