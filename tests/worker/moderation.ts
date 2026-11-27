import assert from "node:assert/strict";

import { required } from "./harness.ts";
import type { SmokeContext } from "./harness.ts";
import { type WireArgs, apiJson, postAction } from "./validate-api.ts";

export async function testModeration({ server, db, signIn }: SmokeContext) {
  const reporter = await signIn("moderation-reporter");
  const left = await signIn("moderation-left");
  const right = await signIn("moderation-right");
  await db
    .prepare("UPDATE user SET role='admin' WHERE id IN ('moderation-left','moderation-right')")
    .run();
  const area = async (name: string) =>
    required(
      await db
        .prepare("INSERT INTO areas(name) VALUES(?) RETURNING id")
        .bind(name)
        .first<number>("id"),
    );
  const first = await area("Scoped North");
  const second = await area("Scoped South");
  await db
    .prepare(
      "INSERT INTO admin_area_scopes(user_id,area_id) VALUES('moderation-left',?),('moderation-right',?)",
    )
    .bind(first, second)
    .run();
  const climb = required(
    await db
      .prepare(
        "INSERT INTO climbs(name,area_id,type,grade) VALUES('Review line',?,'boulder',3) RETURNING id",
      )
      .bind(first)
      .first<number>("id"),
  );

  const queue = async (cookie: string) => {
    const response = await server.fetch("/api/pages/admin/requests", { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
    return apiJson(response, "/api/pages/admin/requests");
  };
  assert.equal((await server.fetch("/api/pages/admin/requests")).status, 401);
  assert.equal(
    (await server.fetch("/api/pages/admin/requests", { headers: { cookie: reporter } })).status,
    403,
  );
  const redirected = await server.fetch("/admin/requests", {
    headers: { cookie: reporter },
    redirect: "manual",
  });
  assert.equal(redirected.status, 307);
  assert.equal(redirected.headers.get("location"), "/");
  const html = await server.fetch("/admin/requests", { headers: { cookie: left } });
  assert.equal(html.status, 200);
  assert.match(await html.text(), /<title>Review requests/);
  assert.deepEqual(await postAction(server, reporter, "requestClimbMove", climb, second), {
    ok: true,
    value: { status: "pending" },
  });
  const row = (await queue(left)).rows[0];
  assert.match(row.description.summary, /Scoped South/);
  assert.deepEqual(row.missingAreaNames, ["Scoped North", "Scoped South"]);
  assert.deepEqual(await postAction(server, left, "approveChangeRequest", row.id), {
    ok: true,
    value: { decision: "awaiting" },
  });
  const pending = (await queue(right)).rows[0];
  assert.deepEqual(pending.missingAreaNames, ["Scoped South"]);
  assert.equal(pending.requester?.name, "moderation-reporter");
  assert.equal(pending.approvers[0].name, "moderation-left");
  assert.deepEqual(await postAction(server, right, "approveChangeRequest", row.id), {
    ok: true,
    value: { decision: "applied" },
  });
  assert.equal(
    await db.prepare("SELECT area_id FROM climbs WHERE id=?").bind(climb).first<number>("area_id"),
    second,
  );
  assert.deepEqual((await queue(right)).rows, []);
  const form: WireArgs<"requestClimbEdit">[1] = {
    __formData: [
      ["name", "Reviewed rename"],
      ["type", "boulder"],
      ["grade", "4"],
    ],
  };
  assert.deepEqual(await postAction(server, right, "requestClimbEdit", climb, form), {
    ok: true,
    value: { status: "applied" },
  });
  assert.deepEqual(await postAction(server, reporter, "requestClimbDelete", climb), {
    ok: true,
    value: { status: "pending" },
  });
  const deletion = (await queue(right)).rows[0];
  assert.equal(
    (await postAction(server, left, "rejectChangeRequest", deletion.id, "outside scope")).ok,
    false,
  );
  assert.deepEqual(
    await postAction(server, right, "rejectChangeRequest", deletion.id, "Keep this line"),
    {
      ok: true,
    },
  );
  assert.equal(
    await db
      .prepare("SELECT review_note FROM change_requests WHERE id=?")
      .bind(deletion.id)
      .first<string>("review_note"),
    "Keep this line",
  );
}
