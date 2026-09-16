CREATE TYPE "public"."reading_event_source" AS ENUM('manual', 'tolino');--> statement-breakpoint
CREATE TYPE "public"."tolino_book_kind" AS ENUM('ebook', 'upload', 'audiobook');--> statement-breakpoint
CREATE TYPE "public"."tolino_match_source" AS ENUM('isbn', 'google', 'tolino', 'manual');--> statement-breakpoint
CREATE TYPE "public"."tolino_sync_status" AS ENUM('idle', 'running', 'ok', 'error');--> statement-breakpoint
CREATE TABLE "tolino_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"publication_id" text NOT NULL,
	"book_id" uuid,
	"match_source" "tolino_match_source",
	"ignored" boolean DEFAULT false NOT NULL,
	"kind" "tolino_book_kind" DEFAULT 'ebook' NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"authors" text[] DEFAULT '{}'::text[] NOT NULL,
	"isbn13" text,
	"publisher" text,
	"language" text,
	"cover_url" text,
	"purchased_at" timestamp with time zone,
	"progress" integer,
	"progress_at" timestamp with time zone,
	"finished" boolean DEFAULT false NOT NULL,
	"finished_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tolino_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"reseller_id" integer NOT NULL,
	"reseller_name" text NOT NULL,
	"hardware_id" text NOT NULL,
	"token_url" text NOT NULL,
	"client_id" text NOT NULL,
	"scope" text NOT NULL,
	"access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token" text NOT NULL,
	"refresh_token_expires_at" timestamp with time zone,
	"auto_sync" boolean DEFAULT true NOT NULL,
	"import_unread" boolean DEFAULT true NOT NULL,
	"include_audiobooks" boolean DEFAULT false NOT NULL,
	"sync_status" "tolino_sync_status" DEFAULT 'idle' NOT NULL,
	"sync_started_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"last_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_events" ADD COLUMN "source" "reading_event_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "tolino_books" ADD CONSTRAINT "tolino_books_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tolino_books" ADD CONSTRAINT "tolino_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tolino_connections" ADD CONSTRAINT "tolino_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tolino_books_user_publication_idx" ON "tolino_books" USING btree ("user_id","publication_id");--> statement-breakpoint
CREATE INDEX "tolino_books_user_book_idx" ON "tolino_books" USING btree ("user_id","book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tolino_connections_user_idx" ON "tolino_connections" USING btree ("user_id");