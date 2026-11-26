import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

import { getCloudflareEnv } from "@/lib/cloudflare-env";

import * as schema from "./schema";

export type Database = DrizzleD1Database<typeof schema>;

export function createDb(d1: D1Database): Database {
  return drizzle(d1, { schema });
}

export async function getDb(): Promise<Database> {
  const env = await getCloudflareEnv();
  return createDb(env.DB);
}
