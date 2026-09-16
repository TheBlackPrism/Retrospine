/**
 * End-to-end smoke test. Requires a running app on BASE_URL with an EMPTY
 * user table, the fixture books from fixture.sql, and the mock OIDC provider
 * from oidc-mock.mjs on OIDC_URL. See README.md in this folder.
 */
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OIDC = process.env.OIDC_URL ?? "http://localhost:4000";
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const OIDC_INTERACTION = new RegExp(
  `${escapeRegExp(OIDC.replace(/^https?:\/\//, ""))}/interaction`,
);
const OUT = process.env.OUT ?? new URL("./shots", import.meta.url).pathname;
const BOOK_ID = "22222222-2222-4222-8222-222222222222";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: false,
  hasTouch: true,
  reducedMotion: "reduce",
});
const page = await context.newPage();
const problems = [];
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text()}`);
});

let step = 0;
async function shot(name) {
  step += 1;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${String(step).padStart(2, "0")}-${name}.png` });
  console.log(`✓ ${name}`);
}
/** Scrolls the target to the middle of the viewport (clear of the fixed nav) and clicks it. */
async function click(locator) {
  await locator.first().waitFor({ timeout: 20000 });
  await locator.first().evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.waitForTimeout(150);
  await locator.first().click();
}
/** Finishes an SSO round trip; the provider may skip its login page when it still has a session. */
async function completeSso(login, finalPattern) {
  await Promise.race([
    page.waitForURL(OIDC_INTERACTION, { timeout: 30000 }),
    page.waitForURL(finalPattern, { timeout: 30000 }),
  ]);
  if (page.url().startsWith(OIDC)) {
    await page.fill('input[name="login"]', login);
    await page.fill('input[name="password"]', "anything");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    if (page.url().startsWith(OIDC)) {
      await page.click('button[type="submit"]');
    }
  }
  await page.waitForURL(finalPattern, { timeout: 30000 });
}
async function expectText(text, timeout = 15000) {
  await page
    .getByText(text, { exact: false })
    .filter({ visible: true })
    .first()
    .waitFor({ timeout });
}

// 1. First run → setup → admin account
await page.goto(`${BASE}/`);
await page.waitForURL(/\/setup/);
await shot("setup");
await page.fill("#name", "Ada Lovelace");
await page.fill("#username", "ada");
await page.fill("#email", "ada@example.test");
await page.fill("#password", "correct-horse-battery");
await page.fill("#confirm", "correct-horse-battery");
await page.click('button[type="submit"]');
await page.waitForURL(/\/library/, { timeout: 30000 });
await expectText("Your shelves");
await shot("library-empty");

// 2. Search (Google Books may be rate limited from CI; either outcome must render cleanly)
await page.goto(`${BASE}/search?q=discworld`);
await Promise.race([
  page.getByRole("button", { name: "Want to read" }).first().waitFor({ timeout: 20000 }),
  page.getByRole("alert").first().waitFor({ timeout: 20000 }),
  page.getByText("No books matched").waitFor({ timeout: 20000 }),
]);
await shot("search");

// 3. Book page (fixture) → add to shelf → milestones
await page.goto(`${BASE}/books/${BOOK_ID}`);
await expectText("Equal Rites");
await expectText("Book 3 of Discworld");
await shot("book-not-on-shelf");
await click(page.getByRole("button", { name: "Start reading" }));
await expectText("Reading", 20000);
await page.getByRole("button", { name: "Add milestone" }).waitFor();
await shot("book-reading");

await click(page.getByRole("button", { name: "Add milestone" }));
await click(page.getByRole("button", { name: "Progress", exact: true }));
await page.fill("#milestone-page", "120");
await page.fill("#milestone-note", "Granny Weatherwax has entered the chat.");
await click(page.getByRole("button", { name: "Save milestone" }));
await expectText("Page 120 of 283", 20000);
await expectText("42%");
await shot("book-timeline");

await click(page.getByRole("button", { name: "Add milestone" }));
await click(page.getByRole("button", { name: "Finished reading", exact: true }));
await click(page.getByRole("button", { name: "Save milestone" }));
await expectText("Finished", 20000);
await shot("book-finished");

// Series editor
await click(page.getByRole("button", { name: "Edit series" }));
await page.fill("#series-position", "3.5");
await click(page.getByRole("button", { name: "Save", exact: true }));
await expectText("Book 3.5 of Discworld", 20000);

await page.goto(`${BASE}/library?shelf=finished`);
await expectText("Equal Rites");
await shot("library-finished");

// 4. Settings + theme
await page.goto(`${BASE}/settings`);
await expectText("Sign-in methods");
await shot("settings");
await click(page.getByRole("radio", { name: "Reading lamp" }));
await page.waitForTimeout(300);
await shot("settings-dark");
await click(page.getByRole("radio", { name: "Daylight" }));

// 5. Admin: invite a reader
await page.goto(`${BASE}/settings/users`);
await page.fill("#new-name", "Grace Hopper");
await page.fill("#new-username", "grace");
await page.fill("#new-email", "grace@example.test");
await page.fill("#new-password", "cobol-forever-1959");
await click(page.getByRole("button", { name: "Create account" }));
await expectText("Account for Grace Hopper created", 20000);
await expectText("@grace");
await shot("users");

// 6. Admin: configure OIDC against the mock provider
await page.goto(`${BASE}/settings/sso`);
await click(page.getByRole("switch", { name: "Enable single sign-on" }));
await page.fill("#oidc-label", "Mock ID");
await page.fill("#oidc-issuer", OIDC);
await page.fill("#oidc-client-id", "retrospine");
await page.fill("#oidc-client-secret", "retrospine-secret");
await click(page.getByRole("button", { name: "Save settings" }));
await expectText("Single sign-on is enabled", 30000);
await shot("sso-settings");

// 7. Link the local admin account to SSO
await page.goto(`${BASE}/settings`);
await click(page.getByRole("button", { name: "Connect" }));
await page.waitForURL(OIDC_INTERACTION, { timeout: 30000 });
await page.fill('input[name="login"]', "ada-sso");
await page.fill('input[name="password"]', "anything");
await page.click('button[type="submit"]');
await page.waitForTimeout(500);
if (page.url().startsWith(OIDC)) {
  await page.click('button[type="submit"]'); // consent → continue
}
await page.waitForURL(/\/settings/, { timeout: 30000 });
await expectText("Connected", 20000);
await shot("sso-linked");

// 8. Sign out, then sign in via SSO
await click(page.getByRole("button", { name: "Sign out" }));
await page.waitForURL(/\/login/, { timeout: 30000 });
await expectText("Continue with Mock ID");
await shot("login");
await click(page.getByRole("button", { name: "Continue with Mock ID" }));
await completeSso("ada-sso", /\/library/);
await expectText("Ada");
await shot("library-after-sso");

// 9. Password login still works, and an unknown SSO identity is rejected (invite-only)
await page.goto(`${BASE}/settings`);
await click(page.getByRole("button", { name: "Sign out" }));
await page.waitForURL(/\/login/);
await page.fill("#username", "grace");
await page.fill("#password", "cobol-forever-1959");
await page.click('button[type="submit"]');
await page.waitForURL(/\/library/, { timeout: 30000 });
await expectText("Grace");
await page.goto(`${BASE}/settings`);
await click(page.getByRole("button", { name: "Sign out" }));
await page.waitForURL(/\/login/);
await context.clearCookies();
await page.goto(`${BASE}/login`);
await click(page.getByRole("button", { name: "Continue with Mock ID" }));
await completeSso("stranger", /\/login\?error=/);
await shot("login-sso-rejected");

// 10. Desktop layout
await page.setViewportSize({ width: 1280, height: 860 });
await page.fill("#username", "ada");
await page.fill("#password", "correct-horse-battery");
await page.click('button[type="submit"]');
await page.waitForURL(/\/library/, { timeout: 30000 });
await page.goto(`${BASE}/library?shelf=finished`);
await expectText("Equal Rites");
await shot("desktop-library");
await page.goto(`${BASE}/books/${BOOK_ID}`);
await expectText("Milestones");
await shot("desktop-book");

await browser.close();
if (problems.length) {
  console.log("\nBrowser problems:");
  for (const problem of problems) console.log(" -", problem);
}
console.log(`\nDone: ${step} screenshots in ${OUT}`);
