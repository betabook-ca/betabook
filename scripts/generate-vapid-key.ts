// Prints a new VAPID private key for local web push: the raw P-256 scalar,
// base64url, for `.dev.vars`. Production uses the OpenTofu `vapid_private_key`
// output instead. The Worker derives the public key browsers subscribe with.
import process from "node:process";

async function main() {
  const { privateKey } = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  if (!jwk.d) throw new Error("WebCrypto returned a key without a private scalar");
  console.log(jwk.d);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
