import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, normalizePath, type Plugin } from "vite";

import { frontendAliases, frontendDir, sourceDir, workspaceDir } from "./paths.ts";

function enforceFrontendBoundary(): Plugin {
  const backendDir = normalizePath(path.join(workspaceDir, "backend")) + "/";
  return {
    name: "betabook:frontend-boundary",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const [id, module] of Object.entries(output.modules)) {
          const source = normalizePath(id);
          if (module.renderedLength > 0 && source.startsWith(backendDir)) {
            this.error(
              `Frontend chunk ${output.fileName} includes a server-only module: ${path.relative(workspaceDir, id)}`,
            );
          }
        }
      }
    },
  };
}

function requireCompiledRoutes(): Plugin {
  const routesDir = normalizePath(path.join(sourceDir, "spa/routes")) + "/";
  return {
    name: "betabook:compiled-routes",
    apply: "build",
    applyToEnvironment: (environment) => environment.config.consumer === "client",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const [id, module] of Object.entries(output.modules)) {
          if (module.renderedLength === 0 || !normalizePath(id).startsWith(routesDir)) continue;
          const imports = this.getModuleInfo(id)?.importedIds ?? [];
          if (
            imports.some((source) => normalizePath(source).endsWith("/react/compiler-runtime.js"))
          )
            return;
        }
      }
      this.error("No shipped SPA route uses React Compiler's memoization runtime.");
    },
  };
}

// oxlint-disable-next-line node/no-process-env -- read only by the local Vite proxy.
const workerOrigin = process.env.BETABOOK_DEV_WORKER_ORIGIN ?? "http://127.0.0.1:3000";

export default defineConfig({
  root: path.join(sourceDir, "spa"),
  publicDir: path.join(frontendDir, "public"),
  plugins: [
    react({ compiler: { logDiagnostics: true } }),
    enforceFrontendBoundary(),
    requireCompiledRoutes(),
  ],
  css: {
    postcss: frontendDir,
  },
  define: {
    "import.meta.env.VITE_BUILD_YEAR": JSON.stringify(String(new Date().getFullYear())),
  },
  resolve: {
    alias: frontendAliases,
  },
  server: {
    port: 3001,
    strictPort: true,
    proxy: {
      "/api": workerOrigin,
      "/robots.txt": workerOrigin,
      "/sitemap-index.xml": workerOrigin,
      "/sitemap": workerOrigin,
      "/openapi.json": workerOrigin,
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
