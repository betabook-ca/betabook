import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";

const specId = "urn:betabook:openapi";
const pointer = (key) => key.replaceAll("~", "~0").replaceAll("/", "~1");

/** Validate the release Worker's replies, including discriminated action results.
 * Only inspect JSON. File downloads and NDJSON streams have separate behavior tests.
 */
export async function checkedTransport(transport) {
  const spec = JSON.parse(
    await readFile(new URL("../../api/openapi.json", import.meta.url), "utf8"),
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
    return response;
  };
}
