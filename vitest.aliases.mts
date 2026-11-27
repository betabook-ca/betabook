import path from "node:path";

import { frontendAliases, frontendDir } from "./frontend/paths.ts";

export const testAliases = [
  { find: "@/test", replacement: path.join(import.meta.dirname, "test") },
  { find: "@/stories", replacement: path.join(frontendDir, "stories") },
  ...frontendAliases,
];
