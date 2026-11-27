import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "vite";

import { publicEntryTemplate } from "./public-entry-template.ts";

async function buildSpa(assetsDir: string, outDir: string) {
  const configFile = path.resolve("frontend/vite.config.ts");
  await build({ configFile, build: { outDir: assetsDir } });
  await copyFile("api/openapi.json", path.join(assetsDir, "openapi.json"));
  await build({
    configFile,
    build: {
      ssr: path.resolve("scripts/static-documents.tsx"),
      outDir,
      manifest: false,
      copyPublicDir: false,
      emptyOutDir: true,
      rolldownOptions: { output: { entryFileNames: "documents.mjs" } },
    },
  });
  const { staticDocuments, publicEntry } = await import(
    pathToFileURL(path.resolve(outDir, "documents.mjs")).href
  );
  const index = await readFile(path.join(assetsDir, "index.html"), "utf8");
  for (const [file, home] of [
    ["public-index.txt", false],
    ["public-home.txt", true],
  ] as const)
    await writeFile(path.join(assetsDir, file), publicEntryTemplate(index, publicEntry(home)));
  const directory = path.join(assetsDir, "static-documents");
  await mkdir(directory, { recursive: true });
  for (const [name, html] of Object.entries(staticDocuments() as Record<string, string>))
    await writeFile(path.resolve(directory, name + ".txt"), html);
}
async function buildApp() {
  if (process.argv.includes("--wrangler")) {
    // oxlint-disable-next-line node/no-process-env -- inputs from the local dev task and release CI.
    const { WRANGLER_COMMAND, BETABOOK_DEV_BUILD, BETABOOK_PREBUILT } = process.env;
    if (WRANGLER_COMMAND === "dev" && BETABOOK_DEV_BUILD === "1") {
      // Wrangler handles change events; mise rebuilds only the stale outputs.
      execFileSync("mise", ["run", "dev:build-worker", ":::", "dev:build-spa"], {
        stdio: "inherit",
      });
      return;
    }
    if (BETABOOK_PREBUILT === "1") return;
  }
  const devSpa = process.argv.includes("--dev-spa");
  await buildSpa(
    path.resolve(devSpa ? "target/betabook-dev/assets" : "dist-spa"),
    path.resolve(
      devSpa
        ? "target/betabook-dev/static-documents"
        : "node_modules/.cache/betabook/static-documents",
    ),
  );
  if (!devSpa && !process.argv.includes("--spa-only")) {
    execFileSync("worker-build", ["--release", "backend/worker", "--locked"], {
      stdio: "inherit",
    });
  }
}
void buildApp().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
