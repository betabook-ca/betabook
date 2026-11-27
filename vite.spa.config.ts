import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const WORKSPACE_ROOT = import.meta.dirname;
const SPA_ROOT = path.resolve(WORKSPACE_ROOT, "spa");

export default defineConfig({
  root: SPA_ROOT,
  publicDir: path.resolve(WORKSPACE_ROOT, "public"),
  plugins: [react()],
  css: {
    postcss: WORKSPACE_ROOT,
  },
  define: {
    // oxlint-disable-next-line node/no-process-env -- build-time footer year matching Next.js layout
    "process.env.NEXT_PUBLIC_BUILD_YEAR": JSON.stringify(String(new Date().getFullYear())),
  },
  resolve: {
    alias: [
      {
        find: /^@\/actions(?:\/.*)?$/,
        replacement: path.resolve(SPA_ROOT, "shims/actions-client.ts"),
      },
      {
        find: /^@\/lib\/contact-action$/,
        replacement: path.resolve(SPA_ROOT, "shims/contact-action-client.ts"),
      },
      { find: "@", replacement: WORKSPACE_ROOT },
      { find: "next/navigation", replacement: path.resolve(SPA_ROOT, "shims/next-navigation.ts") },
      { find: "next/link", replacement: path.resolve(SPA_ROOT, "shims/next-link.tsx") },
      { find: "next/image", replacement: path.resolve(SPA_ROOT, "shims/next-image.tsx") },
      { find: "next/dynamic", replacement: path.resolve(SPA_ROOT, "shims/next-dynamic.tsx") },
      { find: "next/script", replacement: path.resolve(SPA_ROOT, "shims/next-script.tsx") },
    ],
  },
  server: {
    port: 3001,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/robots.txt": "http://127.0.0.1:8787",
      "/sitemap-index.xml": "http://127.0.0.1:8787",
      "/sitemap": "http://127.0.0.1:8787",
    },
  },
  build: {
    outDir: path.resolve(WORKSPACE_ROOT, "dist-spa"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    manifest: "spa-manifest.json",
    target: ["chrome111", "edge111", "firefox115", "safari16.4"],
  },
});
