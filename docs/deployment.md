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

## Published images

Pushing a release tag (`v1.2.3`) runs the `Release image` workflow in
`.github/workflows/release-image.yml`. It builds the image natively for
`linux/amd64` and `linux/arm64`, starts the amd64 image against a throwaway
Postgres until `/api/health` answers, and then publishes one multi-arch
manifest to the GitHub Container Registry:

| Tag | Points at |
| --- | --- |
| `ghcr.io/theblackprism/retrospine:1.2.3` | exactly this release |
| `ghcr.io/theblackprism/retrospine:1.2` | the newest patch release of 1.2 |
| `ghcr.io/theblackprism/retrospine:1` | the newest 1.x release (no `0` tag while the major version is 0) |
| `ghcr.io/theblackprism/retrospine:latest` | the newest release; pre-releases such as `v1.3.0-rc.1` only get their own version tag |

`docker-compose.yml` names the `app` image `ghcr.io/theblackprism/retrospine:latest`:

```bash
docker compose pull app    # fetch the published image
docker compose up -d       # run it
```

`docker compose up -d --build` still builds from the checkout and overwrites
that local tag. To pin a version, set `image: ghcr.io/theblackprism/retrospine:1.2.3`
on the `app` service. Without compose:

```bash
docker run -d -p 3000:3000 \
  -e DATABASE_URL=postgres://user:password@host:5432/retrospine \
  -e BETTER_AUTH_SECRET=... -e BETTER_AUTH_URL=https://books.example.com \
  ghcr.io/theblackprism/retrospine:1.2.3
```

GitHub creates the package as *private* the first time the workflow pushes
to it. Open the package on GitHub (**Packages** on the repository page →
**Package settings** → **Danger Zone** → **Change visibility** → Public) once
so that servers can pull it without a token; until then `docker login ghcr.io`
with a personal access token that has `read:packages` is required.

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

The compose file publishes Postgres on port 5432 of the host so that
`pnpm dev`, `pnpm db:migrate` and `psql` on the same machine can reach it
(`postgres://retrospine:retrospine@localhost:5432/retrospine`). On a server
that is reachable from the internet, restrict the mapping to
`"127.0.0.1:5432:5432"` or remove the `ports` entry of the `db` service; the
app talks to the database over the compose network and does not need it.

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

With the published image:

```bash
docker compose pull app
docker compose up -d
```

From a checkout:

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
