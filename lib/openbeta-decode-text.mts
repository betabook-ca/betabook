// Share Betabook's import decoder rather than maintaining a second entity table.
import readline from "node:readline";

import { decodeHtmlEntities } from "./html-entities.ts";

async function main() {
  for await (const line of readline.createInterface({ input: process.stdin })) {
    const batch: unknown = JSON.parse(line);
    if (!Array.isArray(batch)) throw new TypeError("Expected a batch of rows");
    const decoded = batch.map((row: unknown) => {
      if (!Array.isArray(row)) throw new TypeError("Expected a row of text fields");
      return row.map((value: unknown) =>
        typeof value === "string" ? decodeHtmlEntities(value) : value,
      );
    });
    process.stdout.write(`${JSON.stringify(decoded)}\n`);
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
