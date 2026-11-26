import assert from "node:assert/strict";

export async function testPlatform({ server, signIn }) {
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
