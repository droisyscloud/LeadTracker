import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;

type DB = ReturnType<typeof drizzle<typeof schema>>;
const g = globalThis as unknown as { __ltDb?: DB; __ltSql?: ReturnType<typeof postgres> };

function create(): DB {
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  const sql = g.__ltSql ?? postgres(url, { max: Number(process.env.DATABASE_POOL_SIZE || 10), ssl: process.env.DATABASE_SSL === "true" ? "require" : undefined });
  g.__ltSql = sql;
  return drizzle(sql, { schema });
}

/** Lazily created so `next build` works without a database. */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    if (!g.__ltDb) g.__ltDb = create();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (g.__ltDb as any)[prop];
  },
});
export { schema };
