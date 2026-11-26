import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "vite";

async function buildSpa() {
  const configFile = path.resolve("vite.spa.config.ts");
  await build({ configFile });
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
void buildSpa().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
