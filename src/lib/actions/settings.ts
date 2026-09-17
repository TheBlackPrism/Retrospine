"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuth, invalidateAuth } from "@/lib/auth";
import { OIDC_PROVIDER_ID } from "@/lib/auth/constants";
import { requireAdmin, requireSession } from "@/lib/auth/session";
import { errorMessage } from "@/lib/errors";
import { AUTOMATIC_LANGUAGE, isLanguageCode, normalizeLanguage } from "@/lib/languages";
import { getAppSettings, saveOidcSettings, toDiscoveryUrl } from "@/lib/settings";
import type { ActionResult, FormState } from "./state";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function checkbox(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true";
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "form"}: ${issue.message}` : "Invalid input";
}

/* -------------------------------------------------------------------------- */
/*  Profile                                                                    */
/* -------------------------------------------------------------------------- */

const profileSchema = z.object({
  name: z.string().min(1, "Enter your name").max(80),
  username: z
    .string()
    .min(3, "Usernames need at least 3 characters")
    .max(32)
    .regex(/^[a-z0-9_.-]+$/i, "Only letters, numbers, dots, dashes and underscores"),
  preferredLanguage: z
    .string()
    .max(16)
    .transform((value) => (value === AUTOMATIC_LANGUAGE ? "" : normalizeLanguage(value) ?? value))
    .refine((value) => !value || isLanguageCode(value), "Choose a language from the list"),
});

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const parsed = profileSchema.safeParse({
    name: field(formData, "name"),
    username: field(formData, "username"),
    preferredLanguage: field(formData, "preferredLanguage"),
  });
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };
  try {
    const auth = await getAuth();
    const body: { name: string; username?: string; preferredLanguage: string | null } = {
      name: parsed.data.name,
      preferredLanguage: parsed.data.preferredLanguage || null,
    };
    if (parsed.data.username.toLowerCase() !== session.user.username) {
      body.username = parsed.data.username;
    }
    await auth.api.updateUser({ body, headers: await headers() });
    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return { status: "success", message: "Profile saved" };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "Use at least 8 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "The new passwords do not match",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSession();
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword") ?? "",
    newPassword: formData.get("newPassword") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? "",
  });
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };
  try {
    const auth = await getAuth();
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
    return { status: "success", message: "Password changed" };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function unlinkSsoAction(): Promise<ActionResult> {
  await requireSession();
  try {
    const auth = await getAuth();
    const requestHeaders = await headers();
    const accounts = await auth.api.listUserAccounts({ headers: requestHeaders });
    const linked = accounts.find((account) => account.providerId === OIDC_PROVIDER_ID);
    if (!linked) return { ok: false, error: "Single sign-on is not connected." };
    await auth.api.unlinkAccount({
      body: { accountId: linked.id },
      headers: requestHeaders,
    });
    revalidatePath("/settings");
    return { ok: true, message: "Single sign-on disconnected" };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Admin: users                                                               */
/* -------------------------------------------------------------------------- */

const newUserSchema = z.object({
  name: z.string().min(1, "Enter a name").max(80),
  username: z
    .string()
    .min(3, "Usernames need at least 3 characters")
    .max(32)
    .regex(/^[a-z0-9_.-]+$/i, "Only letters, numbers, dots, dashes and underscores"),
  email: z.email("Enter a valid e-mail address"),
  password: z.string().min(8, "Use at least 8 characters").max(128),
  role: z.enum(["user", "admin"]),
});

export async function createUserAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = newUserSchema.safeParse({
    name: field(formData, "name"),
    username: field(formData, "username"),
    email: field(formData, "email").toLowerCase(),
    password: formData.get("password") ?? "",
    role: field(formData, "role") || "user",
  });
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };
  try {
    const auth = await getAuth();
    await auth.api.createUser({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        name: parsed.data.name,
        role: parsed.data.role,
        data: {
          username: parsed.data.username.toLowerCase(),
          displayUsername: parsed.data.username,
        },
      },
      headers: await headers(),
    });
    revalidatePath("/settings/users");
    return { status: "success", message: `Account for ${parsed.data.name} created` };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function setUserRoleAction(
  userId: string,
  role: "user" | "admin",
): Promise<ActionResult> {
  const session = await requireAdmin();
  if (userId === session.user.id) {
    return { ok: false, error: "You cannot change your own role." };
  }
  try {
    const auth = await getAuth();
    await auth.api.setRole({ body: { userId, role }, headers: await headers() });
    revalidatePath("/settings/users");
    return { ok: true, message: "Role updated" };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function removeUserAction(userId: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (userId === session.user.id) {
    return { ok: false, error: "You cannot delete your own account." };
  }
  try {
    const auth = await getAuth();
    await auth.api.removeUser({ body: { userId }, headers: await headers() });
    revalidatePath("/settings/users");
    return { ok: true, message: "Account deleted" };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Admin: OIDC                                                                */
/* -------------------------------------------------------------------------- */

const oidcSchema = z.object({
  enabled: z.boolean(),
  label: z.string().max(60),
  issuer: z.union([z.url("Enter the issuer URL, e.g. https://id.example.com"), z.literal("")]),
  clientId: z.string().max(500),
  clientSecret: z.string().max(4000),
  scopes: z.string().max(500),
  pkce: z.boolean(),
  allowSignup: z.boolean(),
});

async function verifyDiscovery(issuer: string): Promise<string | null> {
  const url = toDiscoveryUrl(issuer);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return `The discovery document at ${url} answered ${response.status}.`;
    const body = (await response.json()) as { issuer?: string; authorization_endpoint?: string };
    if (!body.authorization_endpoint) {
      return "The discovery document has no authorization endpoint.";
    }
    return null;
  } catch (error) {
    return `Could not load ${url}: ${errorMessage(error, "network error")}`;
  }
}

export async function saveOidcSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = oidcSchema.safeParse({
    enabled: checkbox(formData, "enabled"),
    label: field(formData, "label"),
    issuer: field(formData, "issuer"),
    clientId: field(formData, "clientId"),
    clientSecret: (formData.get("clientSecret") as string | null) ?? "",
    scopes: field(formData, "scopes"),
    pkce: checkbox(formData, "pkce"),
    allowSignup: checkbox(formData, "allowSignup"),
  });
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };

  const input = parsed.data;
  if (input.enabled) {
    const current = await getAppSettings();
    if (!input.issuer) return { status: "error", message: "Enter the issuer URL." };
    if (!input.clientId) return { status: "error", message: "Enter the client id." };
    if (!input.clientSecret.trim() && !current.oidcClientSecret) {
      return { status: "error", message: "Enter the client secret." };
    }
    const discoveryProblem = await verifyDiscovery(input.issuer);
    if (discoveryProblem) return { status: "error", message: discoveryProblem };
  }

  try {
    await saveOidcSettings(input, session.user.id);
    invalidateAuth();
    revalidatePath("/settings/sso");
    revalidatePath("/login");
    return {
      status: "success",
      message: input.enabled ? "Single sign-on is enabled" : "Settings saved",
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
