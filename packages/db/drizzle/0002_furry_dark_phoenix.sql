ALTER TABLE "checkout_sessions" ADD COLUMN "customer_email" varchar(255);--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD COLUMN "customer_name" varchar(255);--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "metadata" jsonb;