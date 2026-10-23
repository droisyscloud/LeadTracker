import "./load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
const sql = postgres(url, { max: 1, ssl: process.env.DATABASE_SSL === "true" ? "require" : undefined });
migrate(drizzle(sql), { migrationsFolder: "./drizzle" })
  .then(() => { console.log("Migrations applied."); return sql.end(); })
  .catch((e) => { console.error(e); process.exit(1); });
