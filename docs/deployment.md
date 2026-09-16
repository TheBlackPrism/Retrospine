# Deployment

## Docker image

The `Dockerfile` builds in three stages:

1. `deps` installs dependencies with pnpm (frozen lockfile).
2. `build` runs `next build` with `output: "standalone"`. The build does not
   need a database.
3. `runner` copies the standalone server, static assets, `public/` and the
   `drizzle/` migrations into a small `node:22-alpine` image that runs as an
   unprivileged user. A `HEALTHCHECK` polls `/api/health`.

Build it with `docker build -t retrospine .` or let compose do it.

## docker compose

`docker-compose.yml` runs Postgres 17 (with a named volume and a health
check) and the app. Variables are read from `.env` in the project directory:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | yes | – | Signs sessions and encrypts stored OIDC secrets (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | yes | `http://localhost:3000` | Public origin people use in the browser |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | no | `retrospine` | Database credentials; `DATABASE_URL` for the app is derived from them |
| `APP_PORT` | no | `3000` | Host port |
| `GOOGLE_BOOKS_API_KEY` | no | – | Raises the Google Books quota |
| `GOOGLE_BOOKS_COUNTRY` | no | `US` | Country code sent with Google Books requests |
| `AUTO_MIGRATE` | no | `true` | Apply migrations on start |

```bash
cp .env.example .env      # set BETTER_AUTH_SECRET and BETTER_AUTH_URL
docker compose up -d --build
docker compose logs -f app
```

When running the image without compose, pass `DATABASE_URL` directly, e.g.
`postgres://user:password@host:5432/retrospine`.

## Reverse proxy and HTTPS

Put the app behind a TLS-terminating proxy and set `BETTER_AUTH_URL` to the
public https origin. Cookies are then marked secure and the OIDC redirect
URI becomes `https://<host>/api/auth/callback/oidc`.

Caddy example:

```
books.example.com {
    reverse_proxy app:3000
}
```

nginx needs `proxy_set_header Host $host;` and the usual
`X-Forwarded-*` headers.

## Migrations

On start the server applies pending migrations from `drizzle/` before it
accepts requests (`src/instrumentation.ts`). Set `AUTO_MIGRATE=false` to
disable this, for example when several replicas start at once, and apply
migrations from a development checkout instead:

```bash
DATABASE_URL=postgres://... pnpm db:migrate
```

## Backups

```bash
docker compose exec db pg_dump -U retrospine retrospine > retrospine-$(date +%F).sql
docker compose exec -T db psql -U retrospine retrospine < retrospine-2026-09-16.sql
```

Cover images are not stored; they are loaded from Google Books and Open
Library at view time.

## Upgrading

```bash
git pull
docker compose up -d --build
```

Migrations run automatically. Check `docker compose logs app` for the
`[db] migrations up to date` line.

## Health and logs

- `GET /api/health` returns `{"ok":true}` when the database answers,
  otherwise `503`.
- The app logs to stdout. Google Books quota and outage messages are logged
  as warnings; search errors are shown to the user with an explanation.
