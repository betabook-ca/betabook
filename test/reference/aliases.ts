import { readdirSync } from "node:fs";
import path from "node:path";

// The old route and database names resolve only for parity tests and TypeScript
// contracts. Production Vite has no fallback into this workspace.
export const referenceAliases = [
  ...["actions", "app", "db", "drizzle/schema"].map((name) => ({
    find: `@/${name}`,
    replacement: path.join(import.meta.dirname, name),
  })),
  ...["lib", "test"].flatMap((dir) =>
    readdirSync(path.join(import.meta.dirname, dir))
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .flatMap((name) => [
        {
          find: `@/${dir}/${name.slice(0, -3)}`,
          replacement: path.join(import.meta.dirname, dir, name),
        },
        { find: `@/${dir}/${name}`, replacement: path.join(import.meta.dirname, dir, name) },
      ]),
  ),
];
