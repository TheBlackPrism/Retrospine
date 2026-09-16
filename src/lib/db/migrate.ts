import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { env } from "@/lib/env";
import { db } from "./index";

/** Applies pending SQL migrations from the `drizzle/` folder. */
export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  await migrate(db, { migrationsFolder });
}

/** Used at server start-up; honours AUTO_MIGRATE and never throws on build. */
export async function autoMigrate(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn("[db] DATABASE_URL is not set, skipping automatic migrations");
    return;
  }
  if (!env.autoMigrate) {
    console.log("[db] AUTO_MIGRATE=false, skipping automatic migrations");
    return;
  }
  const started = Date.now();
  await runMigrations();
  console.log(`[db] migrations up to date (${Date.now() - started}ms)`);
}
