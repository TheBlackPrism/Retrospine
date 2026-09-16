import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/*  Better Auth tables                                                         */
/*  Field names follow the Better Auth core schema plus the username and       */
/*  admin plugins. Keep in sync when upgrading better-auth.                    */
/* -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  // username plugin
  username: text("username").unique(),
  displayUsername: text("display_username"),
  // admin plugin
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // admin plugin
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/* -------------------------------------------------------------------------- */
/*  Application settings (single row, id = 1)                                  */
/* -------------------------------------------------------------------------- */

export const appSettings = pgTable(
  "app_settings",
  {
    id: integer("id").primaryKey().default(1),
    oidcEnabled: boolean("oidc_enabled").default(false).notNull(),
    oidcLabel: text("oidc_label").default("Single sign-on").notNull(),
    oidcIssuer: text("oidc_issuer"),
    oidcClientId: text("oidc_client_id"),
    /** Encrypted with `encryptSecret`, never stored in clear text. */
    oidcClientSecret: text("oidc_client_secret"),
    oidcScopes: text("oidc_scopes").default("openid profile email").notNull(),
    oidcPkce: boolean("oidc_pkce").default(true).notNull(),
    /** Whether an unknown SSO identity may create a brand new account. */
    oidcAllowSignup: boolean("oidc_allow_signup").default(false).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [check("app_settings_singleton", sql`${table.id} = 1`)],
);

/* -------------------------------------------------------------------------- */
/*  Library domain                                                             */
/* -------------------------------------------------------------------------- */

export const readingStatusEnum = pgEnum("reading_status", [
  "want_to_read",
  "reading",
  "finished",
  "abandoned",
]);

export const readingEventTypeEnum = pgEnum("reading_event_type", [
  "started",
  "progress",
  "note",
  "finished",
  "abandoned",
]);

export const seriesSourceEnum = pgEnum("series_source", [
  "google",
  "openlibrary",
  "manual",
]);

export const series = pgTable(
  "series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Lower-cased, whitespace-collapsed name used for de-duplication. */
    normalizedName: text("normalized_name").notNull(),
    googleSeriesId: text("google_series_id"),
    primaryAuthor: text("primary_author"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("series_normalized_name_idx").on(table.normalizedName),
    uniqueIndex("series_google_series_id_idx").on(table.googleSeriesId),
  ],
);

export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googleId: text("google_id"),
    isbn13: text("isbn13"),
    isbn10: text("isbn10"),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    authors: text("authors")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    publisher: text("publisher"),
    publishedDate: text("published_date"),
    description: text("description"),
    pageCount: integer("page_count"),
    categories: text("categories")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    language: text("language"),
    coverUrl: text("cover_url"),
    thumbnailUrl: text("thumbnail_url"),
    seriesId: uuid("series_id").references(() => series.id, {
      onDelete: "set null",
    }),
    seriesPosition: numeric("series_position", {
      precision: 7,
      scale: 2,
      mode: "number",
    }),
    seriesSource: seriesSourceEnum("series_source"),
    /** Google Books series id, kept even when the series name is still unknown. */
    googleSeriesId: text("google_series_id"),
    openLibraryEditionKey: text("open_library_edition_key"),
    openLibraryWorkKey: text("open_library_work_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("books_google_id_idx").on(table.googleId),
    index("books_series_id_idx").on(table.seriesId),
    index("books_isbn13_idx").on(table.isbn13),
    index("books_google_series_id_idx").on(table.googleSeriesId),
  ],
);

export const libraryEntries = pgTable(
  "library_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    status: readingStatusEnum("status").default("want_to_read").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("library_entries_user_book_idx").on(table.userId, table.bookId),
    index("library_entries_user_status_idx").on(table.userId, table.status),
  ],
);

export const readingEvents = pgTable(
  "reading_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => libraryEntries.id, { onDelete: "cascade" }),
    type: readingEventTypeEnum("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    page: integer("page"),
    percent: integer("percent"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("reading_events_entry_idx").on(table.entryId, table.occurredAt),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Relations (for the relational query API)                                   */
/* -------------------------------------------------------------------------- */

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  libraryEntries: many(libraryEntries),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const seriesRelations = relations(series, ({ many }) => ({
  books: many(books),
}));

export const booksRelations = relations(books, ({ one, many }) => ({
  series: one(series, { fields: [books.seriesId], references: [series.id] }),
  entries: many(libraryEntries),
}));

export const libraryEntriesRelations = relations(
  libraryEntries,
  ({ one, many }) => ({
    user: one(user, { fields: [libraryEntries.userId], references: [user.id] }),
    book: one(books, { fields: [libraryEntries.bookId], references: [books.id] }),
    events: many(readingEvents),
  }),
);

export const readingEventsRelations = relations(readingEvents, ({ one }) => ({
  entry: one(libraryEntries, {
    fields: [readingEvents.entryId],
    references: [libraryEntries.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type User = typeof user.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
export type Series = typeof series.$inferSelect;
export type Book = typeof books.$inferSelect;
export type NewBook = typeof books.$inferInsert;
export type LibraryEntry = typeof libraryEntries.$inferSelect;
export type ReadingEvent = typeof readingEvents.$inferSelect;
export type ReadingStatus = (typeof readingStatusEnum.enumValues)[number];
export type ReadingEventType = (typeof readingEventTypeEnum.enumValues)[number];
export type SeriesSource = (typeof seriesSourceEnum.enumValues)[number];
