import "server-only";

import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export function createDatabase(binding: D1Database) {
  return drizzle(binding, { schema });
}

export type AppDatabase = ReturnType<typeof createDatabase>;

export function getDb(): AppDatabase {
  if (!env.DB) {
    throw new Error(
      "Missing Cloudflare D1 binding DB. Configure it in wrangler.jsonc before starting the app.",
    );
  }

  return createDatabase(env.DB);
}
