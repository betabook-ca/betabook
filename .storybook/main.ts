import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/nextjs-vite";
import { storyNameFromExport, toId } from "storybook/internal/csf";
import { mergeConfig } from "vite";

const componentsDir = fileURLToPath(new URL("../components", import.meta.url));
const componentPaths = readdirSync(componentsDir, { recursive: true }).filter(
  (path): path is string => typeof path === "string",
);
const componentFiles = componentPaths
  .filter((path) => /\.tsx?$/.test(path) && !/\.(test|stories)\.|(^|\/)index\.ts$/.test(path))
  .sort();

/** Module path → id of the first story in its colocated `*.stories.tsx`,
 * derived the way the indexer derives ids, so the coverage page counts and
 * links it without a hand-kept entry. */
function colocatedStories(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const file of componentPaths) {
    if (!file.endsWith(".stories.tsx")) continue;
    const source = readFileSync(path.join(componentsDir, file), "utf8");
    const meta = source.slice(source.indexOf("const meta"), source.indexOf("export default meta"));
    // An explicit `id` outlives a title rename, as it does in the indexer.
    const kind =
      /^ {2}id:\s*"([^"]+)"/m.exec(meta)?.[1] ??
      /\btitle:\s*"((?:Components|Patterns|Foundations|Internal)\/[^"]+)"/.exec(meta)?.[1];
    const exportName = /^export const (\w+)/m.exec(source)?.[1];
    if (!kind || !exportName) continue;
    const stem = file.slice(0, -".stories.tsx".length);
    const sibling = [`${stem}.tsx`, `${stem}.ts`].find((name) => componentFiles.includes(name));
    if (sibling) entries[sibling] = toId(kind, storyNameFromExport(exportName));
  }
  return entries;
}

const config: StorybookConfig = {
  addons: ["@storybook/addon-mcp"],
  features: { componentsManifest: true },
  stories: ["../stories/**/*.stories.tsx", "../components/**/*.stories.tsx"],
  staticDirs: [
    "../public",
    { from: "../assets/fonts", to: "/fonts/barlow" },
    { from: "../node_modules/geist/dist/fonts/geist-sans", to: "/fonts/geist" },
  ],
  framework: {
    name: "@storybook/nextjs-vite",
    // The app config starts Cloudflare bindings. Isolated components don't
    // need a Worker, database, environment file, or signed-in account.
    options: { nextConfigPath: ".storybook/next.config.ts" },
  },
  core: { disableTelemetry: true },
  viteFinal: (config) =>
    mergeConfig(config, {
      define: {
        STORYBOOK_COMPONENT_FILES: JSON.stringify(componentFiles),
        STORYBOOK_COLOCATED_STORIES: JSON.stringify(colocatedStories()),
      },
      resolve: {
        alias: [
          {
            find: /^@\/actions\/goal-refresh$/,
            replacement: fileURLToPath(new URL("./mocks/goal-refresh.ts", import.meta.url)),
          },
          // Keep interactive form stories local; match the barrel without affecting submodules.
          {
            find: /^@\/actions$/,
            replacement: fileURLToPath(new URL("./mocks/actions.ts", import.meta.url)),
          },
          {
            find: /^@\/lib\/search-suggestions$/,
            replacement: fileURLToPath(new URL("./mocks/search-suggestions.ts", import.meta.url)),
          },
          {
            find: /^@\/lib\/auth-client$/,
            replacement: fileURLToPath(new URL("./mocks/auth-client.ts", import.meta.url)),
          },
          { find: "@", replacement: fileURLToPath(new URL("../", import.meta.url)) },
        ],
      },
    }),
};

export default config;
