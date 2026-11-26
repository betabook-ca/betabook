import { execFileSync } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "vite";

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
  const { staticDocuments } = await import(
    pathToFileURL(path.resolve(outDir, "documents.mjs")).href
  );
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
