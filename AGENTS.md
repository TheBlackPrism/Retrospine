<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Retrospine project guide

Retrospine is a personal book tracker: Next.js 16 App Router, React 19,
TypeScript, Tailwind v4 + shadcn/ui, Better Auth, Drizzle ORM on PostgreSQL.
Read `README.md` and the pages in `docs/` (architecture, data model,
authentication, books and series, milestones, deployment, development,
troubleshooting) before making changes.

### Commands

- `pnpm dev` – dev server; needs `DATABASE_URL` in `.env` and a migrated database (`pnpm db:migrate`)
- `pnpm check` – lint, `next typegen` + `tsc`, vitest. Run it before committing.
- `pnpm build` – must succeed without a database (pages read headers before querying)
- `pnpm db:generate --name <name>` after editing `src/lib/db/schema.ts`; commit the files in `drizzle/`

### Where things live

- Pages: `src/app/(auth)` (login, setup) and `src/app/(app)` (library, search, books, settings)
- Data access: `src/lib/library.ts`, `src/lib/books/*`, `src/lib/settings.ts`
- Tolino Cloud sync: `src/lib/tolino/*` (client, connection storage, sync engine, scheduler started from `src/instrumentation.ts`; `browser.ts` and `tolino/token-keeper.tsx` renew tokens from the reader's browser when a bookshop blocks the server); see `docs/tolino-sync.md`
- Mutations: server actions in `src/lib/actions/*` returning `ActionResult`/`FormState`
- Auth: `src/lib/auth/options.ts` (config), `getAuth()` (lazy instance), `requireSession()`/`requireAdmin()`
- Pure helpers with unit tests: `src/lib/reading.ts`, `src/lib/books/open-library.ts`, `src/lib/books/google-books.ts`, `src/lib/tolino/parse.ts`
- Release pipeline: `.github/workflows/release-image.yml` builds and publishes the Docker image to GHCR on `*.*.*` tags (see `docs/deployment.md`)

### Rules of thumb

- Server components by default; `"use client"` only for interactive islands.
- Never import `@/lib/db` (or anything that imports it) from a client component; shared constants are in `src/lib/shelves.ts`.
- Every page and action re-validates the session; `src/proxy.ts` is only a cookie check.
- Call `headers()`/`connection()` before any database query in code that a page renders, or `next build` will try to reach the database.
- Use `getAuth()`; call `invalidateAuth()` after changing OIDC settings.
- Keep the warm design tokens in `src/app/globals.css`; accents use `amber`, headings use `font-heading`.
- External APIs: Google Books calls go through `src/lib/books/google-books.ts` (country parameter, retries, caching); Open Library through `open-library.ts`; the Tolino Cloud through `src/lib/tolino/client.ts`. The Thalia group shops (Thalia, Orell Füssli, Osiander) block non-browser clients (Cloudflare) and route their token endpoint by `Origin`, so Retrospine cannot exchange a refresh token for them; the connect form reuses the access token the web reader already obtained (`extractTokenResponse`). Other resellers may allow a server or browser exchange. Every `api.pageplace.de` request falls back to its BOSH counterpart.
- Milestones written by a sync carry `reading_events.source = 'tolino'`; keep `source` when copying or creating events.
