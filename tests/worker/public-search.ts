import assert from "node:assert/strict";

import type { SmokeContext } from "./harness.ts";
import { apiJson } from "./validate-api.ts";

export async function testPublicSearch({ server, db, signIn }: SmokeContext) {
  const area = await db
    .prepare("INSERT INTO areas(name) VALUES('Easy Forager crag') RETURNING id")
    .first<{ id: number }>();
  assert.ok(area);
  const climb = await db
    .prepare(
      "INSERT INTO climbs(area_id,name,type,grade) VALUES(?,'Easy Forager','boulder',3) RETURNING id",
    )
    .bind(area.id)
    .first<{ id: number }>();
  assert.ok(climb);
  const unexpected = await db
    .prepare(
      "INSERT INTO climbs(area_id,name,type,grade) VALUES(?,'Easy Forager alternate','sport',10) RETURNING id",
    )
    .bind(area.id)
    .first<{ id: number }>();
  assert.ok(unexpected);
  const get = async (query: string, headers: Record<string, string> = {}) => {
    const res = await server.fetch("/search?" + query, { headers });
    assert.equal(res.status, 200);
    const html = await res.text();
    const match = html.match(/<script[^>]*id="__BETABOOK_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    return {
      body: html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ""),
      seed: match
        ? (JSON.parse(match[1]) as {
            query: string;
            data: import("@/spa/lib/fetch-json").SearchBootstrapData;
          })
        : null,
    };
  };
  const { body, seed } = await get(
    "mode=climb&name=Easy%20Forager&name=Unused&areaId=" +
      area.id +
      "&discipline=trad&discipline=boulder&ratingRange=0&ratingRange=5&page=3&limit=1",
  );
  assert.match(body, /<form[^>]*action="\/search"[^>]*method="get"/i);
  assert.match(body, /<input[^>]*type="search"[^>]*name="name"[^>]*value="Easy Forager"/);
  assert.match(body, new RegExp(`href="/climbs/${climb.id}/easy-forager"`));
  assert.match(body, new RegExp(`href="/areas/${area.id}/easy-forager-crag"`));
  assert.equal((body.match(/name="discipline"/g) ?? []).length, 2);
  assert.deepEqual(
    seed?.data.climbsPage?.climbs.map((c) => c.id),
    [climb.id],
  );
  assert.equal(seed?.data.areaSelection?.name, "Easy Forager crag");
  assert.equal(seed?.query.includes("name=Easy+Forager"), true);
  assert.deepEqual(
    (await get("mode=climb&name=Easy+Forager&discipline=sport")).seed?.data.climbsPage?.climbs.map(
      (c) => c.id,
    ),
    [unexpected.id],
  );
  const zeroRange = await get(
    "mode=climb&name=Easy+Forager&discipline=boulder&boulderRange=&boulderRange=0",
  );
  assert.deepEqual(zeroRange.seed?.data.climbsPage?.climbs, []);
  const all = await get("mode=all&name=Easy+Forager");
  assert.ok(all.seed?.data.areasPage?.areas.some((a) => a.id === area.id));
  assert.ok(all.seed?.data.climbsPage?.climbs.some((c) => c.id === climb.id));
  const areaOnly = await get("mode=area&mode=climb&name=Easy+Forager");
  assert.equal(areaOnly.seed?.data.climbsPage, undefined);
  assert.ok(areaOnly.seed?.data.areasPage?.areas.some((a) => a.id === area.id));
  const privateQuery = await get("mode=climb&name=Easy+Forager&excludeSent=1");
  assert.equal(privateQuery.seed, null);
  assert.doesNotMatch(privateQuery.body, new RegExp(`href="/climbs/${climb.id}/`));
  // Only a public projection can be reused when the client starts in public mode.
  const cookie = await signIn("search-ssr-member");
  const areaClimbs = async (query: string) => {
    const response = await server.fetch(`/api/areas/${area.id}/climbs?sort=name_asc&${query}`, {
      headers: { cookie },
    });
    assert.equal(response.status, 200);
    const { climbs, page, pageSize, hasNextPage } = await apiJson(
      response,
      "/api/areas/{id}/climbs",
    );
    return { ids: climbs.map((c) => c.id), page, pageSize, hasNextPage };
  };
  // These values exceed a wasm32 usize but are exactly representable in the query.
  const aboveU32 = 2 ** 32 + 1;
  assert.deepEqual(await areaClimbs("limit=1&page=2"), {
    ids: [unexpected.id],
    page: 2,
    pageSize: 1,
    hasNextPage: false,
  });
  assert.deepEqual(await areaClimbs(`limit=${aboveU32}`), {
    ids: [climb.id, unexpected.id],
    page: 1,
    pageSize: 10,
    hasNextPage: false,
  });
  assert.deepEqual((await areaClimbs(`page=${aboveU32}`)).ids, []);
  const member = await get("mode=climb&name=Easy+Forager", { cookie });
  assert.equal(member.seed, null);
  const rankedAreas = ["Z Foothold", "Y Foothold", "A Long Foothold Traverse"];
  await db.batch(
    rankedAreas.map((name) => db.prepare("INSERT INTO areas(name) VALUES (?)").bind(name)),
  );
  const ranked = async (
    path: "/api/search/areas" | "/api/public/search/areas",
    page: number,
    headers: Record<string, string> = {},
  ) => {
    const response = await server.fetch(path + "?name=foothold&limit=2&page=" + page, { headers });
    assert.equal(response.status, 200);
    const result = await apiJson(response, path);
    return [result.areas.map((a) => a.name), result.hasNextPage];
  };
  assert.deepEqual(await ranked("/api/search/areas", 1, { cookie }), [
    rankedAreas.slice(0, 2),
    true,
  ]);
  assert.deepEqual(await ranked("/api/search/areas", 2, { cookie }), [rankedAreas.slice(2), false]);
  assert.deepEqual(await ranked("/api/public/search/areas", 1), [
    [rankedAreas[2], rankedAreas[1]],
    true,
  ]);
}
