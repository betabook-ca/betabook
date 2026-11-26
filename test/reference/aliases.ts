import { readdirSync } from "node:fs";
import path from "node:path";

// The old route and database names resolve only for parity tests and TypeScript
// contracts. Production Vite has no fallback into this workspace.
export const referenceAliases = [
  {
    find: "@/drizzle/migrations",
    replacement: path.resolve(import.meta.dirname, "../../backend/migrations"),
  },
  { find: "@/stories", replacement: path.resolve(import.meta.dirname, "../../frontend/stories") },
  {
    find: "@/.storybook",
    replacement: path.resolve(import.meta.dirname, "../../frontend/.storybook"),
  },
  { find: "@/tests", replacement: path.resolve(import.meta.dirname, "../../tests") },
  ...["actions", "app", "db", "drizzle/schema"].map((name) => ({
    find: `@/${name}`,
    replacement: path.join(import.meta.dirname, name),
  })),
  ...["lib", "test"].flatMap((dir) =>
    readdirSync(path.join(import.meta.dirname, dir)).flatMap((name) =>
      name.endsWith(".ts") && !name.endsWith(".test.ts")
        ? [
            {
              find: `@/${dir}/${name.slice(0, -3)}`,
              replacement: path.join(import.meta.dirname, dir, name),
            },
            { find: `@/${dir}/${name}`, replacement: path.join(import.meta.dirname, dir, name) },
          ]
        : [],
    ),
  ),
  { find: "@/test", replacement: path.resolve(import.meta.dirname, "..") },
];
