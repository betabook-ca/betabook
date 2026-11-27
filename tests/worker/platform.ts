import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";

import { testEntryParity } from "./entry-parity.ts";
import type { SmokeContext } from "./harness.ts";
import { type WireArgs, apiJson, postAction, postRawAction } from "./validate-api.ts";

async function testAssetCaching(server: SmokeContext["server"]) {
  // Everything under /assets/ shares one immutable policy. Fixed URLs belong in public/.
  const assets = await readdir(new URL("../../dist-spa/assets/", import.meta.url), {
    recursive: true,
    withFileTypes: true,
  });
  for (const asset of assets.filter((file) => file.isFile())) {
    assert.match(asset.name, /-[\w-]{8,}\.[a-z\d]+$/i, asset.name);
  }

  const manifest = await server.fetch("/spa-manifest.json");
  assert.equal(manifest.status, 200);
  assert.doesNotMatch(manifest.headers.get("cache-control") ?? "", /immutable/i);
  const assetsManifest = (await manifest.json()) as import("vite").Manifest;
  const entry = assetsManifest["index.html"];
  assert.ok(entry.file && entry.css?.length);
  for (const file of [entry.file, ...entry.css]) {
    const response = await server.fetch(`/${file}`);
    assert.equal(response.status, 200, file);
    const policy = response.headers.get("cache-control") ?? "";
    assert.match(policy, /\bmax-age=31536000\b/);
    assert.match(policy, /\bimmutable\b/);
    assert.doesNotMatch(policy, /\b(?:no-cache|no-store|max-age=0)\b/);
  }

  for (const url of ["/", "/manifest.webmanifest"]) {
    const response = await server.fetch(url);
    assert.equal(response.status, 200, url);
    assert.doesNotMatch(response.headers.get("cache-control") ?? "", /immutable/i);
  }
}

export async function testPlatform({ server, signIn, db }: SmokeContext) {
  await testEntryParity({ server, signIn, db });
  await testAssetCaching(server);
  const specification = await server.fetch("/openapi.json");
  assert.equal(specification.status, 200);
  const api = (await specification.json()) as typeof import("../../openapi.json");
  assert.equal(api.openapi, "3.1.0");
  assert.ok(api.paths["/api/actions/saveGoal"].post.requestBody);
  // Unknown URLs must produce an actual HTTP 404 for crawlers and shared links.
  const missing = await server.fetch("/missing-page-for-smoke");
  assert.equal(missing.status, 404);
  for (const asset of ["/opengraph-image.png", "/favicon.ico", "/apple-icon.png", "/icon.svg"]) {
    const response = await server.fetch(asset);
    assert.equal(response.status, 200, asset);
    assert.match(response.headers.get("content-type") ?? "", /image/);
  }
  const costs = await server.fetch("/api/public/usage");
  assert.equal(costs.status, 200);
  assert.equal(await costs.json(), null);

  const cookie = await signIn("tutorial-member");

  for (const args of [[], [null], ["false"]]) {
    assert.equal((await postRawAction(server, cookie, "setUserPrivate", ...args)).ok, false);
  }
  const account = await apiJson(
    server.fetch("/api/pages/account", { headers: { cookie } }),
    "/api/pages/account",
  );
  assert.equal(account.isPrivate, true);
  for (const setting of [false, true])
    assert.equal((await postAction(server, cookie, "setUserPrivate", setting)).ok, true);

  // A file part must declare a supported image type before it reaches Images or R2.
  const upload = await server.fetch("/api/actions/uploadProfilePhoto", {
    method: "POST",
    headers: { cookie, "content-type": "multipart/form-data; boundary=fixture" },
    body: '--fixture\r\nContent-Disposition: form-data; name="photo"; filename="no-type.png"\r\n\r\nx\r\n--fixture--\r\n',
  });
  assert.deepEqual(await upload.json(), {
    ok: false,
    error: "Profile photos must be a JPEG, PNG or WebP image.",
  });

  const contact = {
    email: "fixture@example.test",
    message: "Local fixture message",
    elapsed: 3000,
  };
  const contactAction = (payload: WireArgs<"submitContactMessage">[0]) =>
    postAction(server, cookie, "submitContactMessage", payload);
  assert.equal((await contactAction({ ...contact, website: "honeypot" })).ok, true);
  assert.equal((await contactAction({ ...contact, message: "" })).ok, false);
  for (let index = 0; index < 3; index += 1) assert.equal((await contactAction(contact)).ok, true);
  assert.deepEqual(await contactAction(contact), {
    ok: false,
    error: "Too many messages from this network. Try again in a minute.",
  });

  const start = await server.fetch("/tutorial/journal?mode=updates&from=account", {
    headers: { cookie },
    redirect: "manual",
  });
  assert.equal(start.status, 307);
  assert.equal(start.headers.get("location"), "/tutorial/journal/journal?from=account");
  assert.equal(
    (await server.fetch("/tutorial/journal/missing-step", { headers: { cookie } })).status,
    404,
  );
  assert.equal(
    (await server.fetch("/tutorial/journal/journal", { headers: { cookie } })).status,
    200,
  );
}
