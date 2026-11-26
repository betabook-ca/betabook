import path from "node:path";

export const frontendDir = import.meta.dirname;
export const workspaceDir = path.resolve(frontendDir, "..");
export const sourceDir = path.join(frontendDir, "src");

// Browser bundles can import frontend source and the shared tutorial registry.
// Test fixtures and Storybook-only modules have separate, runner-specific aliases.
export const frontendAliases = [
  { find: "@/shared", replacement: path.join(workspaceDir, "shared") },
  { find: "@", replacement: sourceDir },
];
