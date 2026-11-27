import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/react-vite";
import { storyNameFromExport, toId } from "storybook/internal/csf";
import { mergeConfig } from "vite";

// oxlint-disable-next-line import/no-relative-parent-imports -- Tool configuration loads before source aliases.
import { frontendAliases } from "../paths.ts";

const componentsDir = fileURLToPath(new URL("../src/components", import.meta.url));
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
  stories: ["../stories/**/*.stories.tsx", "../src/components/**/*.stories.tsx"],
  staticDirs: [
    "../public",
    { from: "../src/assets/fonts", to: "/fonts/barlow" },
    // Stand-ins that stories must load over the network, not from data URLs.
    { from: "../stories/static", to: "/static" },
    { from: "../src/assets/fonts/geist", to: "/fonts/geist" },
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: { viteConfigPath: "frontend/.storybook/vite.config.ts" },
    },
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
            find: /^@\/spa\/lib\/actions-client$/,
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
          { find: "@/stories", replacement: fileURLToPath(new URL("../stories", import.meta.url)) },
          { find: "@/.storybook", replacement: import.meta.dirname },
          { find: "@/test", replacement: fileURLToPath(new URL("../../test", import.meta.url)) },
          ...frontendAliases,
        ],
      },
    }),
};

export default config;
