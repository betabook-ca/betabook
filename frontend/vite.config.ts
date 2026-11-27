import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, normalizePath, type Plugin } from "vite";

import { frontendAliases, frontendDir, sourceDir, workspaceDir } from "./paths.ts";

function enforceFrontendBoundary(): Plugin {
  const excluded = ["backend", "test/reference"].map(
    (dir) => normalizePath(path.join(workspaceDir, dir)) + "/",
  );
  return {
    name: "betabook:frontend-boundary",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const [id, module] of Object.entries(output.modules)) {
          const source = normalizePath(id);
          if (module.renderedLength > 0 && excluded.some((root) => source.startsWith(root))) {
            this.error(
              `Frontend chunk ${output.fileName} includes a server-only module: ${path.relative(workspaceDir, id)}`,
            );
          }
        }
      }
    },
  };
}

export default defineConfig({
  root: path.join(sourceDir, "spa"),
  publicDir: path.join(frontendDir, "public"),
  plugins: [react(), enforceFrontendBoundary()],
  css: {
    postcss: frontendDir,
  },
  define: {
    // oxlint-disable-next-line node/no-process-env -- build-time footer year matching Next.js layout
    "process.env.NEXT_PUBLIC_BUILD_YEAR": JSON.stringify(String(new Date().getFullYear())),
  },
  resolve: {
    alias: frontendAliases,
  },
  server: {
    port: 3001,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/robots.txt": "http://127.0.0.1:3000",
      "/sitemap-index.xml": "http://127.0.0.1:3000",
      "/sitemap": "http://127.0.0.1:3000",
    },
  },
  build: {
    outDir: path.join(workspaceDir, "dist-spa"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    manifest: "spa-manifest.json",
    target: ["chrome111", "edge111", "firefox115", "safari16.4"],
  },
});
