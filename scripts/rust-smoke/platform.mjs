import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";

async function testAssetCaching(server) {
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
  const entry = (await manifest.json())["index.html"];
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

export async function testPlatform({ server, signIn }) {
  await testAssetCaching(server);
  const specification = await server.fetch("/openapi.json");
  assert.equal(specification.status, 200);
  const api = await specification.json();
  assert.equal(api.openapi, "3.1.0");
  assert.ok(api.paths["/api/actions/saveGoal"].post.requestBody);
  // Unknown URLs must produce an actual HTTP 404 for crawlers and shared links.
  const missing = await server.fetch("/missing-page-for-smoke");
  assert.equal(missing.status, 404);
  for (const asset of ["/opengraph-image.png", "/favicon.ico", "/apple-icon.png", "/icon.svg"]) {
    const response = await server.fetch(asset);
    assert.equal(response.status, 200, asset);
    assert.match(response.headers.get("content-type"), /image/);
  }
  const costs = await server.fetch("/api/public/usage");
  assert.equal(costs.status, 200);
  assert.equal(await costs.json(), null);

  const cookie = await signIn("tutorial-member");
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
