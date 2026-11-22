import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

// Miniflare hashes the wrangler.jsonc binding for this name, so it is the same
// in every checkout — which is what lets a plain file copy stand in for wrangler.
const D1_DIR = path.join(".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");

/** The data file, as opposed to miniflare's own `metadata.sqlite`. */
export function findLocalDb(): string | undefined {
  if (!existsSync(D1_DIR)) return undefined;
  return readdirSync(D1_DIR).find(
    (name) => name.endsWith(".sqlite") && !name.startsWith("metadata"),
  );
}

/** The local database, relative to the repo root pnpm runs scripts from; throws how to make one if missing. */
export function requireLocalDb(): string {
  const file = findLocalDb();
  if (!file) {
    throw new Error(`No local database under ${D1_DIR}. Run \`pnpm db:migrate:local\` first.`);
  }
  return path.join(D1_DIR, file);
}
