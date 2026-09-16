import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * A single connection pool shared across the server. In development the pool
 * is cached on `globalThis` so hot reloads do not leak connections.
 */
const globalForDb = globalThis as unknown as { __retrospinePool?: Pool };

function createPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });
}

export const pool: Pool = globalForDb.__retrospinePool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__retrospinePool = pool;
}

export const db = drizzle({ client: pool, schema });

export type Db = typeof db;
export { schema };
