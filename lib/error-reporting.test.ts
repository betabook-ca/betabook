import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CLIENT_ERROR_EVENT,
  errorDigest,
  logClientError,
  logRequestError,
  parseClientErrorReport,
  redactPath,
  REQUEST_ERROR_EVENT,
} from "./error-reporting";

afterEach(() => {
  vi.restoreAllMocks();
});

const TOKEN = "0123456789abcdef0123456789abcdef";

function d1Failure() {
  const cause = new Error("D1_ERROR: VIEWs and/or subqueries nested too deep: SQLITE_ERROR");
  const error = new Error("Failed query: WITH friends AS (…)", { cause });
  error.stack = "Error: Failed query\n    at getFeedPage (feed.ts:82:20)";
  return error;
}

describe("errorDigest", () => {
  // Expected values come from vinext's own `errorDigest` in
  // node_modules/vinext/dist/server/app-rsc-errors.js for the same input, so
  // the digest a browser is shown matches the logged one.
  it("matches the digest vinext gives the browser for an unstamped error", () => {
    const error = new Error("D1_ERROR: VIEWs and/or subqueries nested too deep: SQLITE_ERROR");
    error.stack = "Error: D1_ERROR\n    at getFeedPage (feed.ts:82:20)";
    expect(errorDigest(error)).toBe("1139012270");
    expect(errorDigest("plain string")).toBe("477965546");
  });

  it("keeps a digest the error already carries", () => {
    expect(errorDigest(Object.assign(new Error("boom"), { digest: "NEXT_NOT_FOUND" }))).toBe(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("redactPath", () => {
  it("drops the query string and replaces share tokens", () => {
    expect(redactPath(`/lists/${TOKEN}?view=sent#top`)).toBe("/lists/[token]");
    expect(redactPath(`/trips/${TOKEN.toUpperCase()}/analytics`)).toBe("/trips/[token]/analytics");
    expect(redactPath(`/users/u-1?share=${TOKEN}`)).toBe("/users/u-1");
  });

  it("keeps ordinary ids", () => {
    expect(redactPath("/climbs/252551/sunset-arete")).toBe("/climbs/252551/sunset-arete");
  });
});

describe("logRequestError", () => {
  it("logs one error-level event with the route, digest and the D1 cause", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = d1Failure();

    logRequestError(
      error,
      { path: `/lists/${TOKEN}?view=sends`, method: "GET", headers: {} },
      {
        routerKind: "App Router",
        routePath: "/lists/[token]",
        routeType: "render",
        renderSource: "react-server-components",
        revalidateReason: undefined,
      },
    );

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]).toEqual([
      {
        event: REQUEST_ERROR_EVENT,
        digest: errorDigest(error),
        method: "GET",
        path: "/lists/[token]",
        routePath: "/lists/[token]",
        routeType: "render",
        renderSource: "react-server-components",
        error: {
          name: "Error",
          message: "Failed query: WITH friends AS (…)",
          stack: error.stack,
          causes: [
            {
              name: "Error",
              message: "D1_ERROR: VIEWs and/or subqueries nested too deep: SQLITE_ERROR",
            },
          ],
        },
      },
    ]);
  });

  it("logs a thrown non-error and caps long messages", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    logRequestError(
      "x".repeat(5000),
      { path: "/feed", method: "POST", headers: {} },
      {
        routerKind: "App Router",
        routePath: "/feed",
        routeType: "action",
        revalidateReason: undefined,
      },
    );

    const [entry] = log.mock.calls[0] as [{ error: { name: string; message: string } }];
    expect(entry.error.name).toBe("string");
    expect(entry.error.message).toHaveLength(1001);
    expect(entry).not.toHaveProperty("renderSource");
  });
});

describe("parseClientErrorReport", () => {
  it("accepts what the boundary sends, redacting the path", () => {
    expect(
      parseClientErrorReport({
        boundary: "page",
        digest: "1139012270",
        message: "An error occurred in the Server Components render.",
        path: `/projects/${TOKEN}`,
      }),
    ).toEqual({
      boundary: "page",
      digest: "1139012270",
      message: "An error occurred in the Server Components render.",
      path: "/projects/[token]",
    });
    expect(parseClientErrorReport({ boundary: "global", message: "boom", path: "/" })).toEqual({
      boundary: "global",
      message: "boom",
      path: "/",
    });
  });

  it.each([
    ["a non-object", "boom"],
    ["an array", []],
    ["an unknown boundary", { boundary: "other", message: "m", path: "/" }],
    ["a missing message", { boundary: "page", path: "/" }],
    ["an absolute URL", { boundary: "page", message: "m", path: "https://evil.example/" }],
    ["a long path", { boundary: "page", message: "m", path: `/${"a".repeat(600)}` }],
    ["a non-string digest", { boundary: "page", message: "m", path: "/", digest: 7 }],
    ["a long digest", { boundary: "page", message: "m", path: "/", digest: "d".repeat(65) }],
  ])("refuses %s", (_label, body) => {
    expect(parseClientErrorReport(body)).toBeNull();
  });

  it("logs a client report as its own event", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    logClientError({ boundary: "page", message: "boom", path: "/feed" });
    expect(log).toHaveBeenCalledWith({
      event: CLIENT_ERROR_EVENT,
      boundary: "page",
      message: "boom",
      path: "/feed",
    });
  });
});
