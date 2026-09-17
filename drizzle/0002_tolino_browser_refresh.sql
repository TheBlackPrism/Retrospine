CREATE TYPE "public"."tolino_refresh_mode" AS ENUM('server', 'browser');--> statement-breakpoint
ALTER TABLE "tolino_connections" ADD COLUMN "refresh_mode" "tolino_refresh_mode" DEFAULT 'server' NOT NULL;--> statement-breakpoint
ALTER TABLE "tolino_connections" ADD COLUMN "token_refreshed_at" timestamp with time zone;