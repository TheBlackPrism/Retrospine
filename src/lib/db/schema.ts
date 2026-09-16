import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
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

/** Where a milestone came from: entered by hand or imported by a sync. */
export const readingEventSourceEnum = pgEnum("reading_event_source", [
  "manual",
  "tolino",
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
    source: readingEventSourceEnum("source").default("manual").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("reading_events_entry_idx").on(table.entryId, table.occurredAt),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Tolino Cloud sync                                                          */
/* -------------------------------------------------------------------------- */

export const tolinoSyncStatusEnum = pgEnum("tolino_sync_status", [
  "idle",
  "running",
  "ok",
  "error",
]);

/** Counters of the last completed sync run, shown in the settings. */
export type TolinoSyncSummary = {
  /** Publications seen in the Tolino library. */
  books: number;
  /** Publications linked to a book in Retrospine. */
  matched: number;
  /** Shelf entries created by this run. */
  added: number;
  /** Milestones (progress, started, finished) recorded by this run. */
  events: number;
  /** Publications skipped: excluded by the user or failed to record. */
  skipped: number;
  /** Publications waiting for a Google Books lookup (rate limit); retried next time. */
  deferred: number;
};

/** One Tolino Cloud account per user. Tokens are encrypted with `encryptSecret`. */
export const tolinoConnections = pgTable(
  "tolino_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Tolino partner ("reseller") id, e.g. 3 for Thalia.de, 8 for Orell Füssli. */
    resellerId: integer("reseller_id").notNull(),
    resellerName: text("reseller_name").notNull(),
    /** Device id registered with the Tolino Cloud; sent as `hardware_id`. */
    hardwareId: text("hardware_id").notNull(),
    /** OAuth token endpoint and client of the bookshop, captured when connecting. */
    tokenUrl: text("token_url").notNull(),
    clientId: text("client_id").notNull(),
    scope: text("scope").notNull(),
    /** Encrypted; refreshed before it expires. */
    accessToken: text("access_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    /** Encrypted; rotated on every refresh. */
    refreshToken: text("refresh_token").notNull(),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    /** Sync on a schedule, not only when pressing "Sync now". */
    autoSync: boolean("auto_sync").default(true).notNull(),
    /** Put books that were never opened on the "Want to read" shelf. */
    importUnread: boolean("import_unread").default(true).notNull(),
    /** Also import audiobooks from the Tolino library. */
    includeAudiobooks: boolean("include_audiobooks").default(false).notNull(),
    syncStatus: tolinoSyncStatusEnum("sync_status").default("idle").notNull(),
    syncStartedAt: timestamp("sync_started_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    lastSummary: jsonb("last_summary").$type<TolinoSyncSummary>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("tolino_connections_user_idx").on(table.userId)],
);

export const tolinoBookKindEnum = pgEnum("tolino_book_kind", [
  "ebook",
  "upload",
  "audiobook",
]);

/** How a Tolino publication was linked to a book in Retrospine. */
export const tolinoMatchSourceEnum = pgEnum("tolino_match_source", [
  "isbn",
  "google",
  "tolino",
  "manual",
]);

/**
 * A publication in a user's Tolino library together with the reading state
 * that was last synced, so that repeated syncs only record what changed.
 */
export const tolinoBooks = pgTable(
  "tolino_books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Tolino publication id, e.g. `DT0400.9783641243609_A40398678`. */
    publicationId: text("publication_id").notNull(),
    bookId: uuid("book_id").references(() => books.id, { onDelete: "set null" }),
    matchSource: tolinoMatchSourceEnum("match_source"),
    /** Excluded from syncing by the user ("Don't sync this book"). */
    ignored: boolean("ignored").default(false).notNull(),
    kind: tolinoBookKindEnum("kind").default("ebook").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    authors: text("authors")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isbn13: text("isbn13"),
    publisher: text("publisher"),
    language: text("language"),
    coverUrl: text("cover_url"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }),
    /** Reading progress in percent as last seen in the Tolino Cloud. */
    progress: integer("progress"),
    progressAt: timestamp("progress_at", { withTimezone: true }),
    /** Marked as finished in Tolino (system tag) or read to the end. */
    finished: boolean("finished").default(false).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** The last sync run in which the publication was present. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("tolino_books_user_publication_idx").on(
      table.userId,
      table.publicationId,
    ),
    index("tolino_books_user_book_idx").on(table.userId, table.bookId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Relations (for the relational query API)                                   */
/* -------------------------------------------------------------------------- */

export const userRelations = relations(user, ({ one, many }) => ({
  sessions: many(session),
  accounts: many(account),
  libraryEntries: many(libraryEntries),
  tolinoConnection: one(tolinoConnections, {
    fields: [user.id],
    references: [tolinoConnections.userId],
  }),
  tolinoBooks: many(tolinoBooks),
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

export const tolinoConnectionsRelations = relations(
  tolinoConnections,
  ({ one }) => ({
    user: one(user, {
      fields: [tolinoConnections.userId],
      references: [user.id],
    }),
  }),
);

export const tolinoBooksRelations = relations(tolinoBooks, ({ one }) => ({
  user: one(user, { fields: [tolinoBooks.userId], references: [user.id] }),
  book: one(books, { fields: [tolinoBooks.bookId], references: [books.id] }),
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
export type ReadingEventSource =
  (typeof readingEventSourceEnum.enumValues)[number];
export type TolinoConnection = typeof tolinoConnections.$inferSelect;
export type NewTolinoConnection = typeof tolinoConnections.$inferInsert;
export type TolinoBook = typeof tolinoBooks.$inferSelect;
export type NewTolinoBook = typeof tolinoBooks.$inferInsert;
export type TolinoBookKind = (typeof tolinoBookKindEnum.enumValues)[number];
export type TolinoMatchSource =
  (typeof tolinoMatchSourceEnum.enumValues)[number];
export type TolinoSyncStatus = (typeof tolinoSyncStatusEnum.enumValues)[number];
