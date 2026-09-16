import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[health] database check failed", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
