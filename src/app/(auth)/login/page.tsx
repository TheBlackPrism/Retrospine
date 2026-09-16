import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/format";
import { countUsers, getPublicOidcInfo } from "@/lib/settings";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  await connection();
  if ((await countUsers()) === 0) redirect("/setup");

  const params = await props.searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" ? params.error : null;
  const sso = await getPublicOidcInfo();

  return (
    <LoginForm next={next} ssoLabel={sso?.label ?? null} initialError={error} />
  );
}
