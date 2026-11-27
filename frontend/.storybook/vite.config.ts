import { defineConfig } from "vite";

// oxlint-disable-next-line import/no-relative-parent-imports -- Tool configuration loads before source aliases.
import { frontendDir } from "../paths.ts";

/** Build the component gallery independently of the application bundle. */
export default defineConfig({ css: { postcss: frontendDir } });
