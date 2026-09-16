# Retrospine

A personal book tracker with a warm, mobile-first interface. Search Google
Books, keep your shelves (Reading, Want to read, Finished, Set aside), record
milestones on a timeline, and see where a book sits in its series.

## Features

- **Shelves** – four reading statuses with animated, cover-first grids.
- **Search** – Google Books search by title, author or ISBN with one-tap adding.
- **Milestones** – a timeline per book: started, progress (page or percent),
  notes, finished, set aside. Milestones move the book between shelves and
  drive the progress bar; re-reads are supported.
- **Series** – volume number and series name from Google Books, with Open
  Library as a fallback and a manual override. The book page shows the other
  volumes of the same series.
- **Accounts** – username and password login. The first account created on a
  fresh install becomes the administrator; afterwards registration is closed
  and the admin invites readers from the settings.
- **Single sign-on** – any OpenID Connect provider, configured from the
  settings UI (no restart). Existing local accounts can be connected to SSO
  from their settings and then sign in either way.
- **Themes** – cream "daylight" paper and a warm "reading lamp" dark mode.

## Stack

| Layer      | Choice                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack, server actions), React 19, TypeScript |
| Styling    | Tailwind CSS v4, shadcn/ui (Radix), Motion, Fraunces + Inter          |
| Auth       | Better Auth (username, admin and generic OAuth plugins)               |
| Data       | PostgreSQL 17, Drizzle ORM                                            |
| Deployment | Docker multi-stage image, docker compose                              |

## Run it with Docker

```bash
cp .env.example .env
# set BETTER_AUTH_SECRET (openssl rand -base64 32) and BETTER_AUTH_URL
docker compose up -d --build
```

Open the app (default http://localhost:3000). The first visit shows the setup
page; the account you create there is the administrator. Database migrations
run automatically when the container starts (`AUTO_MIGRATE=true`).

`BETTER_AUTH_URL` must be the public URL people use in the browser (for
example `https://books.example.com`). It is used for OIDC redirect URIs and
secure cookies.

## Local development

```bash
pnpm install
docker compose up -d db          # or any Postgres 14+
cp .env.example .env             # DATABASE_URL pointing at localhost
pnpm db:migrate                  # apply migrations
pnpm dev                         # http://localhost:3000
```

| Script             | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| `pnpm dev`         | Development server                                   |
| `pnpm build`       | Production build (standalone output)                 |
| `pnpm check`       | Lint, type-check and unit tests                      |
| `pnpm db:generate` | Create a migration after editing `src/lib/db/schema.ts` |
| `pnpm db:migrate`  | Apply migrations                                     |
| `pnpm db:studio`   | Browse the database                                  |

## Environment variables

| Variable               | Required | Description                                                     |
| ---------------------- | -------- | --------------------------------------------------------------- |
| `DATABASE_URL`         | yes      | Postgres connection string                                      |
| `BETTER_AUTH_SECRET`   | yes      | Signs sessions and encrypts stored OIDC secrets                 |
| `BETTER_AUTH_URL`      | yes      | Public base URL of the deployment                               |
| `GOOGLE_BOOKS_API_KEY` | no       | Raises the Google Books quota; works without one at low volume  |
| `AUTO_MIGRATE`         | no       | Set to `false` to run `pnpm db:migrate` yourself                |

## Configuring single sign-on

1. In your identity provider create a confidential OIDC client with the
   redirect URI `<BETTER_AUTH_URL>/api/auth/callback/oidc`.
2. As an administrator open **Settings → Single sign-on**, enable it, and
   enter the issuer URL, client id and client secret. Saving verifies the
   provider's discovery document.
3. Readers with an existing local account open **Settings → Sign-in methods
   → Connect** once. From then on the login page offers both the password
   form and the SSO button.
4. Leave **Allow new accounts via SSO** off to keep the instance invite-only;
   turn it on if anyone at your provider may create an account.

The client secret is stored encrypted with a key derived from
`BETTER_AUTH_SECRET`; rotating that secret requires re-entering it.

## Where series data comes from

1. Google Books sometimes reports a series id and volume number, but not the
   series name.
2. Open Library editions (looked up by ISBN) often carry the series name and
   number, e.g. `Harry Potter, #1`.
3. Anything missing or wrong can be corrected on the book page; books that
   share a Google series id are linked automatically once one of them has a
   name.

Other volumes are found by searching Google Books for the series name and
author and are merged with the books already in your database.

Google Books allows a modest number of unauthenticated requests per day per
IP address. Set `GOOGLE_BOOKS_API_KEY` if searches start failing.

## Project layout

```
src/app/(auth)        login and first-run setup
src/app/(app)         library, search, book detail, settings
src/app/api           auth handler, book search, health check
src/components        UI (shadcn primitives in components/ui)
src/lib/auth          Better Auth configuration (rebuilt when OIDC settings change)
src/lib/books         Google Books and Open Library clients, series resolution
src/lib/db            Drizzle schema, connection, migrations bootstrap
src/lib/library.ts    shelves and milestones
src/lib/actions       server actions used by the UI
drizzle/              SQL migrations
```
