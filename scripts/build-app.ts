import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "vite";

import { publicEntryTemplate } from "./public-entry-template.ts";

async function buildSpa() {
  const configFile = path.resolve("frontend/vite.config.ts");
  await build({ configFile });
  await copyFile("api/openapi.json", "dist-spa/openapi.json");
  const outDir = path.resolve("node_modules/.cache/betabook/static-documents");
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
  const index = await readFile("dist-spa/index.html", "utf8");
  for (const [file, home] of [
    ["public-index.txt", false],
    ["public-home.txt", true],
  ] as const)
    await writeFile(path.join("dist-spa", file), publicEntryTemplate(index, publicEntry(home)));
  const directory = path.resolve("dist-spa/static-documents");
  await mkdir(directory, { recursive: true });
  for (const [name, html] of Object.entries(staticDocuments() as Record<string, string>))
    await writeFile(path.resolve(directory, name + ".txt"), html);
}
async function buildApp() {
  // CI downloads the same release artifacts that passed the workerd smoke suite.
  // oxlint-disable-next-line node/no-process-env -- set by CI after restoring the tested release
  if (process.argv.includes("--wrangler") && process.env.BETABOOK_PREBUILT === "1") return;
  await buildSpa();
  if (!process.argv.includes("--spa-only")) {
    execFileSync("worker-build", ["--release", "backend/worker", "--locked"], {
      stdio: "inherit",
    });
  }
}
void buildApp().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
