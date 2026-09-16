import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SetupForm } from "@/components/auth/setup-form";
import { countUsers } from "@/lib/settings";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  await connection();
  if ((await countUsers()) > 0) redirect("/login");
  return <SetupForm />;
}
