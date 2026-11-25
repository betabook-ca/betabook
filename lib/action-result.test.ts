import { describe, expect, it, vi } from "vitest";

import {
  ActionError,
  GENERIC_ERROR_MESSAGE,
  NotAdminError,
  NotSignedInError,
  NOT_ADMIN_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  toActionResult,
} from "./action-result";
import { REQUEST_ERROR_EVENT } from "./error-reporting";

describe("toActionResult", () => {
  it("wraps a successful body's return value in ok:true", async () => {
    expect(await toActionResult(async () => 42)).toEqual({ ok: true, value: 42 });
  });

  it("wraps a void body in ok:true", async () => {
    expect(await toActionResult(async () => {})).toEqual({ ok: true, value: undefined });
  });

  it("passes an ActionError's message through to ok:false", async () => {
    expect(
      await toActionResult(async () => {
        throw new ActionError("Can't delete a climb with logged sends");
      }),
    ).toEqual({ ok: false, error: "Can't delete a climb with logged sends" });
  });

  it("maps a missing session to the friendly expired-session message", async () => {
    expect(
      await toActionResult(async () => {
        throw new NotSignedInError();
      }),
    ).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
  });

  it("maps a non-admin session to the admins-only message", async () => {
    expect(
      await toActionResult(async () => {
        throw new NotAdminError();
      }),
    ).toEqual({ ok: false, error: NOT_ADMIN_MESSAGE });
  });

  it("logs an unexpected Error and returns the generic message instead of leaking it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const internal = new Error("D1_ERROR: something leaked from the driver");
      expect(
        await toActionResult(async () => {
          throw internal;
        }),
      ).toEqual({ ok: false, error: GENERIC_ERROR_MESSAGE });
      expect(consoleError).toHaveBeenCalledWith({
        event: REQUEST_ERROR_EVENT,
        routeType: "action",
        error: expect.objectContaining({
          name: "Error",
          message: "D1_ERROR: something leaked from the driver",
        }),
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("returns the generic message for non-Error throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(
        await toActionResult(async () => {
          throw "nope";
        }),
      ).toEqual({ ok: false, error: GENERIC_ERROR_MESSAGE });
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each([
    ["a null-prototype object", () => Object.create(null) as unknown],
    [
      "an Error with a null-prototype cause",
      () => new Error("boom", { cause: Object.create(null) }),
    ],
  ])("returns the generic message when %s is thrown", async (_label, make) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(
        await toActionResult(async () => {
          throw make();
        }),
      ).toEqual({ ok: false, error: GENERIC_ERROR_MESSAGE });
      expect(consoleError).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
  });
});
