import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CLIENT_ERROR_EVENT,
  errorDigest,
  installConsoleScrub,
  logActionError,
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
  error.stack = "Error: Failed query: WITH friends AS (…)\n    at getFeedPage (feed.ts:82:20)";
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

  it("stringifies a digest field that is not a string, as vinext does", () => {
    // vinext's `hasDigest` counts any `digest` field and shows the browser
    // `String(error.digest)`, so the log must say the same.
    expect(errorDigest(Object.assign(new Error("boom"), { digest: undefined }))).toBe("undefined");
    expect(errorDigest(Object.assign(new Error("boom"), { digest: 7 }))).toBe("7");
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

  it("keeps ordinary ids and slugs", () => {
    expect(redactPath("/climbs/252551/sunset-arete")).toBe("/climbs/252551/sunset-arete");
    expect(redactPath("/areas/365/the-long-approach-boulders")).toBe(
      "/areas/365/the-long-approach-boulders",
    );
  });

  it("replaces reset tokens, avatar keys and other credential-like segments", () => {
    expect(redactPath("/api/auth/reset-password/aB3dE5fG7hJ9kL1mN3pQ5rS7")).toBe(
      "/api/auth/reset-password/[token]",
    );
    expect(redactPath("/api/avatars/u1/" + "ab12".repeat(16))).toBe("/api/avatars/u1/[token]");
    // Mixed case with no digit, the 1-in-60 better-auth token.
    expect(redactPath("/api/auth/reset-password/aBcDeFgHiJkLmNoPqRsTuVwX")).toBe(
      "/api/auth/reset-password/[token]",
    );
    expect(redactPath("/users/C21eDLSbyoYF7XwXl9vB3qZbleIogj0O")).toBe("/users/[token]");
  });

  it("replaces a segment that holds an email address, encoded or not", () => {
    expect(redactPath("/users/climber%40example.com/trips")).toBe("/users/[email]/trips");
    expect(redactPath("/users/climber@example.com")).toBe("/users/[email]");
    expect(redactPath("/users/%E0%A4%A")).toBe("/users/%E0%A4%A");
  });

  it("replaces a percent-encoded token", () => {
    const encoded = TOKEN.replace(/./g, (c) => `%${c.charCodeAt(0).toString(16)}`);
    expect(redactPath(`/lists/${encoded}`)).toBe("/lists/[token]");
    expect(redactPath("/search/sunset%20arete")).toBe("/search/sunset%20arete");
  });
});

describe("error text", () => {
  function loggedMessage(error: unknown) {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    logActionError(error);
    const [entry] = log.mock.calls.at(-1) as [{ error: { message: string } }];
    return entry.error.message;
  }

  it("drops the input a JSON parse error quotes", () => {
    let parseError: unknown;
    try {
      JSON.parse("my private journal entry");
    } catch (error) {
      parseError = error;
    }
    const message = loggedMessage(parseError);
    expect(message).not.toContain("private journal");
    expect(message).toContain('"[redacted]" is not valid JSON');
  });

  it("drops parse input that holds quotes of its own", () => {
    let parseError: unknown;
    try {
      JSON.parse('my "note": "a private journal"');
    } catch (error) {
      parseError = error;
    }
    const message = loggedMessage(parseError);
    expect(message).not.toMatch(/private journal|note/);
    expect(message).toBe(`Unexpected token 'm', "[redacted]" is not valid JSON`);
  });

  it("drops email addresses and session tokens", () => {
    expect(
      loggedMessage(
        new Error("No session for climber@example.com with token Xk29fJq8LmPz3RtVw7Yb0cDe"),
      ),
    ).toBe("No session for [email] with token [token]");
  });

  it("keeps SQL identifiers, camelCase names and D1 codes readable", () => {
    const message =
      "D1_ERROR: no such column: journal_companions_active_idx.sendCommentVisible: SQLITE_ERROR";
    expect(loggedMessage(new Error(message))).toBe(message);
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

  it("drops a failed query's bound values and every share token from message, stack and causes", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = `Failed query: SELECT * FROM climb_list_share_links WHERE token = ?\nparams: ${TOKEN},climber@example.com,my private journal\nsecond line`;
    const error = new Error(message, {
      cause: new Error(`D1_ERROR: no such link /lists/${TOKEN}`),
    });
    error.stack = `Error: ${message}\n    at getSharedList (climb-list-shares.ts:40:9)\n    at /lists/${TOKEN}`;

    logRequestError(
      error,
      { path: "/lists/[token]", method: "GET", headers: {} },
      {
        routerKind: "App Router",
        routePath: "/lists/[token]",
        routeType: "render",
        revalidateReason: undefined,
      },
    );

    const [entry] = log.mock.calls[0] as [{ digest: string; error: Record<string, unknown> }];
    expect(entry.error).toEqual({
      name: "Error",
      message:
        "Failed query: SELECT * FROM climb_list_share_links WHERE token = ?\nparams: [redacted]",
      stack:
        "Error: Failed query: SELECT * FROM climb_list_share_links WHERE token = ?\nparams: [redacted]\n    at getSharedList (climb-list-shares.ts:40:9)\n    at /lists/[token]",
      causes: [{ name: "Error", message: "D1_ERROR: no such link /lists/[token]" }],
    });
    expect(JSON.stringify(entry)).not.toMatch(/climber@example\.com|private journal|[0-9a-f]{32}/);
    // The digest still hashes the raw error, so it matches the browser's.
    expect(entry.digest).toBe(errorDigest(error));
  });

  it("keeps only the frames of a stack that does not contain the message", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Failed query: SELECT 1\nparams: secret@example.com");
    error.stack =
      "DrizzleQueryError: rewritten header with secret@example.com\n    at run (db.ts:1:1)";

    logRequestError(
      error,
      { path: "/feed", method: "GET", headers: {} },
      {
        routerKind: "App Router",
        routePath: "/feed",
        routeType: "render",
        revalidateReason: undefined,
      },
    );

    const [entry] = log.mock.calls[0] as [{ error: { stack: string } }];
    expect(entry.error.stack).toBe("    at run (db.ts:1:1)");
  });

  it("drops HTML rendering's copy of an error the RSC render already logged", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const ssr = {
      routerKind: "App Router",
      routePath: "/feed",
      routeType: "render",
      renderSource: "server-rendering",
      revalidateReason: undefined,
    } as const;
    const productionCopy = Object.assign(
      new Error("An error occurred in the Server Components render."),
      { digest: "3404251440" },
    );

    logRequestError(productionCopy, { path: "/feed", method: "GET", headers: {} }, ssr);
    expect(log).not.toHaveBeenCalled();

    // An error raised in HTML rendering itself carries no digest and is logged.
    logRequestError(
      new Error("client component threw"),
      { path: "/feed", method: "GET", headers: {} },
      ssr,
    );
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("logs no cause for a null cause", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    logActionError(new Error("boom", { cause: null }));
    const [entry] = log.mock.calls[0] as [{ error: { causes: unknown[] } }];
    expect(entry.error.causes).toEqual([]);
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

describe("logActionError", () => {
  it("logs a caught action error as a request_error with the action route type", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = d1Failure();

    logActionError(error);

    expect(log).toHaveBeenCalledWith({
      event: REQUEST_ERROR_EVENT,
      routeType: "action",
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
    });
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
  ])("refuses %s", (_label, body) => {
    expect(parseClientErrorReport(body)).toBeNull();
  });

  it.each([
    ["a long number", "1".repeat(11)],
    ["a token", TOKEN],
    ["free text", "a@b.co"],
    ["a stringified undefined", "undefined"],
  ])("drops %s as digest but keeps the report", (_label, digest) => {
    expect(parseClientErrorReport({ boundary: "page", message: "m", path: "/", digest })).toEqual({
      boundary: "page",
      message: "m",
      path: "/",
    });
  });

  it("accepts a Next control digest", () => {
    expect(
      parseClientErrorReport({
        boundary: "page",
        message: "m",
        path: "/",
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      })?.digest,
    ).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("replaces a share token in a reported message", () => {
    expect(
      parseClientErrorReport({
        boundary: "page",
        message: `Could not load /trips/${TOKEN}`,
        path: "/",
      })?.message,
    ).toBe("Could not load /trips/[token]");
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

describe("installConsoleScrub", () => {
  function fakeConsole() {
    const calls: unknown[][] = [];
    const record = (...args: unknown[]) => {
      calls.push(args);
    };
    const target = {
      error: record,
      warn: record,
      log: record,
      info: record,
      debug: record,
    } as unknown as Console;
    return { target, calls };
  }

  it("scrubs the raw error vinext logs beside onRequestError", () => {
    const { target, calls } = fakeConsole();
    installConsoleScrub(target);
    const error = new Error(
      `Failed query: select * from user where email = ?\nparams: climber@example.com,${TOKEN}`,
    );
    error.stack = `Error: ${error.message}\n    at handler (route.ts:1:1)`;

    target.error("[vinext] Route handler error:", error);

    expect(calls).toHaveLength(1);
    const [prefix, logged] = calls[0] as [string, { message: string }];
    expect(prefix).toBe("[vinext] Route handler error:");
    expect(logged.message).toBe(
      "Failed query: select * from user where email = ?\nparams: [redacted]",
    );
    expect(JSON.stringify(calls)).not.toMatch(/climber@example\.com|[0-9a-f]{32}/);
  });

  it("scrubs strings on every method and passes structured events through", () => {
    const { target, calls } = fakeConsole();
    installConsoleScrub(target);
    const event = { event: REQUEST_ERROR_EVENT, path: "/feed" };

    target.warn("no session for climber@example.com");
    target.log(event, 3);

    expect(calls[0]).toEqual(["no session for [email]"]);
    expect(calls[1]?.[0]).toBe(event);
    expect(calls[1]?.[1]).toBe(3);
  });

  it("logs a placeholder instead of throwing for an argument it cannot scrub", () => {
    const { target, calls } = fakeConsole();
    installConsoleScrub(target);
    const hostile = new Error("boom");
    Object.defineProperty(hostile, "stack", {
      get() {
        throw new Error("no stack for you");
      },
    });

    expect(() => target.error("[vinext] Server action error:", hostile)).not.toThrow();
    expect(calls[0]).toEqual(["[vinext] Server action error:", "[unloggable]"]);
  });

  it("wraps only once", () => {
    const { target, calls } = fakeConsole();
    installConsoleScrub(target);
    const wrapped = target.error;
    installConsoleScrub(target);
    expect(target.error).toBe(wrapped);
    target.error("x");
    expect(calls).toHaveLength(1);
  });
});
