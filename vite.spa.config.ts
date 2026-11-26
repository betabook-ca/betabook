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
  resolve: {
    alias: {
      "@": WORKSPACE_ROOT,
      "next/navigation": path.resolve(SPA_ROOT, "shims/next-navigation.ts"),
      "next/link": path.resolve(SPA_ROOT, "shims/next-link.tsx"),
      "next/image": path.resolve(SPA_ROOT, "shims/next-image.tsx"),
      "next/dynamic": path.resolve(SPA_ROOT, "shims/next-dynamic.tsx"),
    },
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
