import { defineConfig } from "vite";

/** Storybook's own Vite config. Without it the builder loads the app's
 * vite.config.ts, whose vinext and Cloudflare plugins build a Worker rather
 * than a component gallery. @storybook/nextjs-vite supplies the Next.js
 * integration; main.ts adds the aliases. */
export default defineConfig({});
