import { cloudflare } from "@cloudflare/vite-plugin";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // Reads next.config.ts for headers, env, images and server action limits,
    // and registers @vitejs/plugin-rsc itself for the app/ directory.
    vinext({
      // `/_next/image` resizes through the IMAGES binding in wrangler.jsonc,
      // the same one profile photo uploads use. Only Google profile photos
      // reach it: uploaded photos and the brand mark render unoptimized.
      images: { optimizer: imagesOptimizer() },
    }),
    // Runs the server environments in workerd with wrangler.jsonc's bindings,
    // in `pnpm dev` as well as the deployed Worker; the SSR environment is
    // bundled into the same Worker as the RSC one.
    cloudflare({ viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] } }),
  ],
  environments: Object.fromEntries(
    ["client", "rsc", "ssr"].map((name) => [
      name,
      {
        optimizeDeps: {
          // vinext scans app/** for dependencies to pre-bundle in dev. Tests
          // are colocated there and import `cloudflare:test`, which only the
          // Vitest pool provides; one unresolvable import makes Vite skip
          // pre-bundling entirely.
          entries: ["!app/**/*.test.{ts,tsx}"],
        },
      },
    ]),
  ),
  server: {
    // `next dev`'s defaults, which the README, .dev.vars.example and the UI
    // suite assume: port 3000, reachable from a phone on the LAN.
    port: 3000,
    host: true,
  },
  // `vite preview` never falls back to `server.port`, and auth trusts only
  // localhost:3000–3003 (lib/auth.ts), matching .dev.vars' BETTER_AUTH_URL.
  preview: { port: 3000 },
  build: {
    // What vinext already sets for production builds. Stated here because
    // Vite's dev server otherwise inlines small imported assets as data URIs
    // in the server environments only, so the brand SVGs hydrate against a
    // different `src` in `pnpm dev`. Next.js never inlines image imports.
    assetsInlineLimit: 0,
    // package.json#browserslist. Vite's own default baseline moves with its
    // releases; nothing here polyfills built-ins, so pin the floor.
    target: ["chrome111", "edge111", "firefox115", "safari16.4"],
  },
});
