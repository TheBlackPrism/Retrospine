# Authentication and single sign-on

Retrospine uses [Better Auth](https://www.better-auth.com) with the
`username`, `admin` and `genericOAuth` plugins. Configuration lives in
`src/lib/auth/options.ts`.

## Accounts and roles

- Users sign in with a username and password. E-mail addresses are stored
  (Better Auth requires them and they are used to match SSO identities) but
  are not used to sign in.
- Roles are `admin` and `user`. Administrators manage readers and the SSO
  configuration; everything else is the same for both.
- Passwords need at least 8 characters and are hashed by Better Auth
  (scrypt). Usernames are 3 to 32 characters and are stored lower-cased.

## First run and invitations

- When the database has no users, `/setup` is the only page that works and
  `/login` redirects to it. The account created there becomes `admin`
  (a database hook sets the role when the user count is zero).
- Afterwards the public sign-up endpoint is blocked by a Better Auth
  `before` hook on `/sign-up/email`, so nobody can register themselves.
  Administrators create accounts under **Settings → Readers** with an
  initial password.
- An administrator cannot delete or demote their own account from the UI.

## Sessions

Sessions live in the `session` table and are referenced by an httpOnly
cookie. They last 30 days and are extended once per day of activity. A
signed cookie cache avoids a database round trip for five minutes; changes
such as a role update therefore take up to five minutes to reach an open
session.

`src/proxy.ts` only checks that the cookie exists, which keeps the redirect
for anonymous visitors fast. Real validation happens in `requireSession()`
and `requireAdmin()` (`src/lib/auth/session.ts`), which every page and every
server action calls.

## Single sign-on (OpenID Connect)

### Configuration

Administrators configure the provider under **Settings → Single sign-on**.
Any OIDC provider with a discovery document works (Authentik, Keycloak,
Zitadel, Auth0, Entra ID, Okta, …). Register Retrospine there as a
confidential web client with the redirect URI

```
<BETTER_AUTH_URL>/api/auth/callback/oidc
```

| Field | Notes |
| --- | --- |
| Enable | Shows the button on the login page |
| Button label | Free text |
| Issuer URL | The discovery document is fetched from `<issuer>/.well-known/openid-configuration` when you save; saving fails with a message if it cannot be loaded |
| Client id / secret | From the provider. Leave the secret empty when editing to keep the stored one |
| Scopes | Defaults to `openid profile email`; `openid` is always included |
| Use PKCE | On by default |
| Allow new accounts via SSO | Off by default (invite-only) |

The client secret is encrypted before it is stored (AES-256-GCM with a key
derived from `BETTER_AUTH_SECRET` through HKDF, see `src/lib/crypto.ts`).
Rotating `BETTER_AUTH_SECRET` therefore requires entering the secret again.

Saving the form calls `invalidateAuth()`; the next request builds a Better
Auth instance with the new provider, so no restart is needed.

### Connecting an existing account

A signed-in user opens **Settings → Sign-in methods → Connect**. Better
Auth's `linkSocial` flow sends them to the provider and, on return, stores
the provider subject as an `oidc` account row on the current user. Because
`allowDifferentEmails` is enabled, the e-mail address at the provider does
not have to match the local one. The connection can be removed again with
**Disconnect**; the password remains valid.

### Signing in with SSO

When someone uses the SSO button, Better Auth resolves the identity in this
order:

1. An `oidc` account with the same provider subject exists → that user is
   signed in.
2. No linked account, but a user with the same e-mail address exists and the
   provider reports the address as verified → the account is linked
   automatically (the provider is listed as trusted) and the user is signed
   in.
3. Otherwise a new account is created only if **Allow new accounts via SSO**
   is on. When it is off the login page shows an explanation and the person
   has to be invited first and connect their account.

Signing out only ends the Retrospine session; the provider session is left
alone (`disableProviderLogout`).

### Error messages on the login page

The login page maps Better Auth's error codes (passed back as `?error=`)
to explanations:

| Code | Meaning |
| --- | --- |
| `signup_disabled` | Unknown identity while self-signup is off |
| `account_not_linked` | An account with that e-mail exists but could not be linked automatically (address not verified) |
| `email_not_found` | The provider did not return an e-mail address; add the `email` scope |
| `oauth_provider_not_found` | SSO was disabled while the person was at the provider |
| `state_mismatch` | The attempt expired or cookies were blocked |

## Security notes

- Set `BETTER_AUTH_URL` to the exact public origin. It is used for cookie
  attributes (secure cookies on https), CSRF origin checks and the redirect
  URI.
- `BETTER_AUTH_SECRET` signs cookies and encrypts stored secrets; use at
  least 32 random bytes and keep it stable.
- All mutations run through server actions that re-validate the session and
  role; ids sent from the browser are always checked against the signed-in
  user (for example a milestone can only be deleted by the owner of its
  entry).
