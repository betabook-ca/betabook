import process from "node:process";

async function main() {
  const { privateKey } = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64");
  const body = der.match(/.{1,64}/g)?.join("\n");
  console.log(`-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
