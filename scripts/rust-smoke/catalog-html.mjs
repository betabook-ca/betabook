import assert from "node:assert/strict";

export async function testCatalogHtml({ server, db, signIn }) {
  const home = await server.fetch("/");
  assert.match(home.headers.get("vary") ?? "", /cookie/i);
  const homeHtml = await home.text();
  assert.match(homeHtml, /<form[^>]+action="\/search"/);
  assert.match(homeHtml, /<input[^>]+name="name"/);

  const landing = await server.fetch("/climbing-logbook");
  assert.equal(landing.status, 200);
  const landingHtml = await landing.text();
  assert.match(landingHtml, /<h1\b[^>]*>A free climbing logbook/);
  assert.doesNotMatch(landingHtml, /<script[^>]+type="module"/);

  const area = await db
    .prepare("INSERT INTO areas(name,description) VALUES (?,?) RETURNING id")
    .bind("North crag", "Follow the creek.")
    .first();
  const climb = await db
    .prepare(
      "INSERT INTO climbs(name,area_id,type,grade,description) VALUES (?,?,?,?,?) RETURNING id",
    )
    .bind("Granite <Flake>", area.id, "boulder", 5, "A thin flake & a mantle.")
    .first();
  const areaPath = `/areas/${area.id}/north-crag`;
  const climbPath = `/climbs/${climb.id}/granite-flake`;
  const cookie = await signIn("catalog-private-sender");
  await db
    .prepare(
      "INSERT INTO sends(user_id,climb_id,suggested_grade,ascent_style,comment,date_sent) VALUES(?,?,5,'redpoint',?,?)",
    )
    .bind("catalog-private-sender", climb.id, "Private redaction sentinel", "2024-10-14")
    .run();
  const memberDocument = await server.fetch(climbPath, { headers: { cookie } });
  assert.equal(memberDocument.status, 200);
  assert.doesNotMatch(await memberDocument.text(), /id="public-entry"/);
  for (const [path, title, text] of [
    [areaPath, "North crag", "Follow the creek."],
    [climbPath, "Granite &lt;Flake&gt;", "A thin flake &amp; a mantle."],
  ]) {
    const res = await server.fetch(path);
    assert.equal(res.status, 200);
    const main = (await res.text()).match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
    assert.ok(main, "Anonymous catalog requests must return readable content in the document");
    assert.ok(main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1].includes(title));
    assert.ok(main.includes(text));
    if (path === areaPath) assert.ok(main.includes(`href="${climbPath}"`));
    else {
      assert.ok(main.includes(`href="${areaPath}"`));
      assert.match(main, /<h2\b[^>]*>Sends<\/h2>/);
      assert.doesNotMatch(
        main,
        /<Flake>|Private redaction sentinel|catalog-private-sender|2024-10-14/,
      );
      assert.match(main, /Betabook climber/);
    }
  }
}
