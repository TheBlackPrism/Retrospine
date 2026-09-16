CREATE TYPE "public"."reading_event_type" AS ENUM('started', 'progress', 'note', 'finished', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."reading_status" AS ENUM('want_to_read', 'reading', 'finished', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."series_source" AS ENUM('google', 'openlibrary', 'manual');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"oidc_enabled" boolean DEFAULT false NOT NULL,
	"oidc_label" text DEFAULT 'Single sign-on' NOT NULL,
	"oidc_issuer" text,
	"oidc_client_id" text,
	"oidc_client_secret" text,
	"oidc_scopes" text DEFAULT 'openid profile email' NOT NULL,
	"oidc_pkce" boolean DEFAULT true NOT NULL,
	"oidc_allow_signup" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "app_settings_singleton" CHECK ("app_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_id" text,
	"isbn13" text,
	"isbn10" text,
	"title" text NOT NULL,
	"subtitle" text,
	"authors" text[] DEFAULT '{}'::text[] NOT NULL,
	"publisher" text,
	"published_date" text,
	"description" text,
	"page_count" integer,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"language" text,
	"cover_url" text,
	"thumbnail_url" text,
	"series_id" uuid,
	"series_position" numeric(7, 2),
	"series_source" "series_source",
	"google_series_id" text,
	"open_library_edition_key" text,
	"open_library_work_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"book_id" uuid NOT NULL,
	"status" "reading_status" DEFAULT 'want_to_read' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"type" "reading_event_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"page" integer,
	"percent" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"google_series_id" text,
	"primary_author" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" text,
	"display_username" text,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_events" ADD CONSTRAINT "reading_events_entry_id_library_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."library_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "books_google_id_idx" ON "books" USING btree ("google_id");--> statement-breakpoint
CREATE INDEX "books_series_id_idx" ON "books" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "books_isbn13_idx" ON "books" USING btree ("isbn13");--> statement-breakpoint
CREATE INDEX "books_google_series_id_idx" ON "books" USING btree ("google_series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_entries_user_book_idx" ON "library_entries" USING btree ("user_id","book_id");--> statement-breakpoint
CREATE INDEX "library_entries_user_status_idx" ON "library_entries" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "reading_events_entry_idx" ON "reading_events" USING btree ("entry_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "series_normalized_name_idx" ON "series" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "series_google_series_id_idx" ON "series" USING btree ("google_series_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");