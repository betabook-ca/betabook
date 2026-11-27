import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";

import type { paths } from "@/spa/generated/api";
import type { ActionName } from "@/spa/lib/action-contracts";

import type { SmokeFetch, SmokeResponse, SmokeServer } from "./harness.ts";
type Content = { content?: Record<string, { schema: unknown }> };
type Operation = { responses: Record<string, Content & { $ref?: string }>; requestBody?: Content };
const validated = new WeakMap<SmokeResponse, string>();
const specId = "urn:betabook:openapi";
const pointer = (key: string) => key.replaceAll("~", "~0").replaceAll("/", "~1");

/** Validate the release Worker's replies, including discriminated action results.
 * Only inspect JSON. File downloads and NDJSON streams have separate behavior tests.
 */
export async function checkedTransport(transport: SmokeServer["fetch"]): Promise<SmokeFetch> {
  const spec: { paths: Record<string, Record<string, Operation>> } = JSON.parse(
    await readFile(new URL("../../openapi.json", import.meta.url), "utf8"),
  );
  const ajv = new Ajv2020({ strict: false, validateFormats: false });
  ajv.addSchema({ ...spec, $id: specId });
  const routes = Object.entries(spec.paths).map(([template, methods]) => ({
    template,
    methods,
    pattern: new RegExp(
      "^" +
        template
          .split("/")
          .map((segment) =>
            segment.startsWith("{") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          )
          .join("/") +
        "$",
    ),
  }));
  return async (url, init) => {
    const response = await transport(url, init);
    const pathname = new URL(url, "http://localhost").pathname;
    if (
      !pathname.startsWith("/api/") ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      return response;
    const method = (init?.method ?? "GET").toLowerCase();
    const route = routes.find((r) => r.pattern.test(pathname) && method in r.methods);
    assert.ok(route, method + " " + pathname + " missing from OpenAPI");
    const op = route.methods[method];
    const status = String(response.status);
    const declared = op.responses[status] ?? op.responses.default;
    assert.ok(declared, route.template + " does not declare HTTP " + status);
    const target = declared.$ref
      ? declared.$ref + "/content/application~1json/schema"
      : "#/paths/" +
        pointer(route.template) +
        "/" +
        method +
        "/responses/" +
        (op.responses[status] ? status : "default") +
        "/content/application~1json/schema";
    const validate = ajv.getSchema(specId + target);
    assert.ok(validate, method + " " + route.template + " is missing a JSON response schema");
    const payload = await response.clone().json();
    assert.ok(
      validate(payload),
      method + " " + route.template + " HTTP " + status + ": " + ajv.errorsText(validate.errors),
    );
    // Negative tests deliberately submit invalid input. Only accepted JSON
    // writes must conform to the documented request schema.
    if (
      method === "post" &&
      response.ok &&
      !(
        typeof payload === "object" &&
        payload !== null &&
        "ok" in payload &&
        payload.ok === false
      ) &&
      typeof init?.body === "string" &&
      op.requestBody?.content?.["application/json"]
    ) {
      const requestSchema = ajv.getSchema(
        specId +
          "#/paths/" +
          pointer(route.template) +
          "/post/requestBody/content/application~1json/schema",
      );
      assert.ok(requestSchema);
      assert.ok(
        requestSchema(JSON.parse(init.body)),
        route.template + " request: " + ajv.errorsText(requestSchema.errors),
      );
    }
    validated.set(response, route.template);
    return response;
  };
}

// Read the generated wire type only after checking the actual route and status.
type JsonContent<R> = R extends { content: { "application/json": infer T } } ? T : never;
type OperationBody<Op, Status extends number> = Op extends { responses: infer R }
  ? Status extends keyof R
    ? JsonContent<R[Status]>
    : R extends { default: infer Fallback }
      ? JsonContent<Fallback>
      : never
  : never;
type JsonBody<P extends keyof paths, Status extends number> = OperationBody<
  paths[P]["get" | "post"],
  Status
>;

export async function apiJson<P extends keyof paths, S extends number = 200>(
  response: SmokeResponse | Promise<SmokeResponse>,
  template: P,
  status?: S,
): Promise<JsonBody<P, S>> {
  const reply = await response;
  assert.equal(reply.status, status ?? 200);
  assert.equal(validated.get(reply), template);
  return (await reply.json()) as JsonBody<P, S>;
}

export type WireArgs<N extends ActionName> =
  paths[`/api/actions/${N}`]["post"]["requestBody"]["content"] extends {
    "application/json": { args: infer A extends unknown[] };
  }
    ? A
    : never;

export function postAction<N extends ActionName>(
  server: SmokeServer,
  cookie: string,
  name: N,
  ...args: WireArgs<N>
) {
  return postRawAction(server, cookie, name, ...args);
}

export async function postRawAction<N extends ActionName>(
  server: SmokeServer,
  cookie: string,
  name: N,
  ...args: unknown[]
) {
  // Negative cases send malformed args. checkedTransport validates successful writes.
  const path = `/api/actions/${name}` as const;
  const reply = await server.fetch(path, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ args }),
  });
  assert.equal(reply.status, 200, await reply.clone().text());
  assert.equal(validated.get(reply), path);
  return (await reply.json()) as paths[typeof path]["post"]["responses"][200]["content"]["application/json"];
}
