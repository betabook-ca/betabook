import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/nextjs-vite";
import { mergeConfig } from "vite";

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
        STORYBOOK_COMPONENT_FILES: JSON.stringify(
          readdirSync(fileURLToPath(new URL("../components", import.meta.url)), { recursive: true })
            .filter(
              (path): path is string =>
                typeof path === "string" &&
                /\.tsx?$/.test(path) &&
                !/\.(test|stories)\.|(^|\/)index\.ts$/.test(path),
            )
            .sort(),
        ),
      },
      resolve: {
        alias: [
          // Keep interactive form stories local; match the barrel without affecting submodules.
          {
            find: /^@\/actions$/,
            replacement: fileURLToPath(new URL("./mocks/actions.ts", import.meta.url)),
          },
          {
            find: /^@\/lib\/search-suggestions$/,
            replacement: fileURLToPath(new URL("./mocks/search-suggestions.ts", import.meta.url)),
          },
          { find: "@", replacement: fileURLToPath(new URL("../", import.meta.url)) },
        ],
      },
    }),
};

export default config;
