# Development guide

## Prerequisites

- Node.js 22 and pnpm 10 (`corepack enable` or `npm i -g pnpm`)
- PostgreSQL 14 or newer (the compose file provides Postgres 17)

## Setup

```bash
pnpm install
docker compose up -d db
cp .env.example .env            # DATABASE_URL pointing at localhost:5432
pnpm db:migrate
pnpm dev                        # http://localhost:3000
```

The first visit shows the setup page; the account you create is the admin.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Development server with Turbopack |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `pnpm typecheck` | `next typegen` (route types) followed by `tsc --noEmit` |
| `pnpm test` / `pnpm test:watch` | Vitest unit tests |
| `pnpm check` | Lint, type-check and tests together |
| `pnpm db:generate --name <name>` | Create a migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Drizzle Studio |

## Conventions

- **Server first.** Pages are server components; data access happens in
  `src/lib`. Client components are limited to interactive islands and are
  marked with `"use client"`.
- **Mutations are server actions** in `src/lib/actions`. They validate the
  session, validate input, call `src/lib`, `revalidatePath`, and return an
  `ActionResult` / `FormState` instead of throwing. Client components show
  the result with `sonner` toasts or inline alerts.
- **Never import database code into client components.** Shared constants
  and labels live in `src/lib/shelves.ts`, which has no database imports.
- **Read request state before the database.** Anything that can run during
  `next build` (pages, layouts) must call `headers()` / `cookies()` or
  `connection()` before querying, otherwise prerendering tries to reach the
  database. `getSession()` already does this.
- **Auth instance.** Use `getAuth()`; never construct `betterAuth` elsewhere.
  Call `invalidateAuth()` after changing OIDC settings.
- **Forms.** Simple forms use `useActionState` with a server action;
  interactive flows use `useTransition` and call the action directly.
- **Styling.** Tailwind utilities plus the tokens in `globals.css`. Use
  `bg-amber`/`text-amber-foreground` for accents and `font-heading` for
  serif headings. Add shadcn components with
  `pnpm dlx shadcn@latest add <component>`.
- **Animations.** Use `motion/react`; keep them short (200–400 ms) and let
  `MotionConfig` handle reduced motion.

## Tests

- Unit tests live next to the code in `__tests__` folders and run with
  Vitest (`pnpm test`). They cover Google Books normalization and retries,
  Open Library series parsing, and progress/session derivation.
- The end-to-end smoke test in `e2e/` drives a real browser through setup,
  shelves, milestones, user administration and the complete OIDC flow
  against a mock provider. See [`e2e/README.md`](../e2e/README.md).

## Releasing

1. Bump `version` in `package.json`, run `pnpm check`, and commit on `main`.
2. Tag the commit with a semantic version and push the tag (creating a GitHub
   release for a new tag does the same):

   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

3. The `Release image` workflow (`.github/workflows/release-image.yml`)
   builds the image for amd64 and arm64, smoke-tests it and publishes it as
   `ghcr.io/theblackprism/retrospine:1.2.3` (plus `1.2`, `1` and `latest`).
   See [deployment.md](deployment.md#published-images) for the tags and for
   making the package public after the first release.
4. Pre-releases (`v1.3.0-rc.1`) are built the same way but only receive their
   own version tag, so `latest` keeps pointing at the last stable release.

## Adding a feature: checklist

1. Schema change? Edit `src/lib/db/schema.ts`, run `pnpm db:generate`,
   review the SQL, run `pnpm db:migrate`.
2. Data access in `src/lib/<area>.ts`, with a unit test for pure logic.
3. Server action in `src/lib/actions`, returning a result object.
4. UI component under `src/components/<area>`, page under `src/app/(app)`.
5. `pnpm check`, then update the relevant page in `docs/`.
