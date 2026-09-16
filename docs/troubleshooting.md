# Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Search shows "Google Books is temporarily unavailable" | Google answered `503`; it does so intermittently and consistently for server IPs it cannot geolocate | The app already retries and sends a `country` parameter. Set `GOOGLE_BOOKS_COUNTRY` to your country and/or add `GOOGLE_BOOKS_API_KEY` |
| Search shows "Google Books is rate-limiting this server" | The unauthenticated daily quota for the server's IP is used up (`429`) | Create a Google Cloud project with the Books API enabled and set `GOOGLE_BOOKS_API_KEY` |
| A book has no series or the wrong volume number | Neither Google Books nor Open Library had data for that edition | Use *Edit series* on the book page; books sharing a Google series id are linked automatically |
| "More from …" shows nothing | Google Books lookup failed or found only box sets | Reload later; books you add yourself always appear |
| Login page says "Registration is closed" | Sign-up is only open for the very first account | Ask an administrator to create the account under Settings → Readers |
| SSO button missing on the login page | SSO is disabled or incomplete in Settings → Single sign-on | Enable it and fill issuer, client id and secret |
| Saving SSO settings fails with a discovery error | The issuer URL is wrong or unreachable from the server | Check `<issuer>/.well-known/openid-configuration` from the container (`docker compose exec app wget -qO- …`) |
| SSO login ends with "No account exists for this single sign-on identity" | Self-signup via SSO is off and the identity is not linked | Invite the person, let them sign in with the password and connect SSO under Settings, or enable *Allow new accounts via SSO* |
| SSO login ends with "state mismatch" | Cookies were blocked or `BETTER_AUTH_URL` does not match the address in the browser | Set `BETTER_AUTH_URL` to the exact public origin and restart |
| Redirect URI rejected by the provider | The registered URI differs from the one shown in the settings form | Register `<BETTER_AUTH_URL>/api/auth/callback/oidc` exactly |
| Signed out unexpectedly after changing `BETTER_AUTH_SECRET` | Session cookies are signed with the secret | Expected; sign in again. Re-enter the OIDC client secret as well |
| Container restarts with a migration error | A migration failed halfway | Inspect `docker compose logs app`, fix the database, or set `AUTO_MIGRATE=false` and run `pnpm db:migrate` from a checkout |
| Covers are blank with a coloured placeholder | The cover host could not be reached from the browser, or Google has no image | Placeholders are generated from the title; nothing to fix |
| `next build` fails with a database error | A page queries the database before reading request headers | Call `headers()`/`connection()` first; see [development.md](development.md) |
