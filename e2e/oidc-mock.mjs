/**
 * Minimal OpenID Connect provider for local testing of the SSO flow.
 * Any username with any password signs in; the e-mail is <login>@example.test.
 */
import Provider from "oidc-provider";

const ISSUER = process.env.OIDC_URL ?? "http://localhost:4000";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const port = Number(new URL(ISSUER).port || 4000);

const provider = new Provider(ISSUER, {
  clients: [
    {
      client_id: "retrospine",
      client_secret: "retrospine-secret",
      redirect_uris: [`${APP_URL}/api/auth/callback/oidc`],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
    },
  ],
  features: { devInteractions: { enabled: true } },
  claims: {
    openid: ["sub"],
    email: ["email", "email_verified"],
    profile: ["name"],
  },
  pkce: { required: () => false },
  cookies: { keys: ["dev-cookie-key"] },
  findAccount: async (_ctx, id) => ({
    accountId: id,
    claims: async () => ({
      sub: id,
      email: `${id}@example.test`,
      email_verified: true,
      name: id.charAt(0).toUpperCase() + id.slice(1),
    }),
  }),
});

provider.listen(port, () => {
  console.log(`Mock OIDC provider listening on ${ISSUER}`);
  console.log("Client id: retrospine  Client secret: retrospine-secret");
});
