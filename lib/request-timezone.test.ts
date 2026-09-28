import { describe, expect, it } from "vitest";

import { REQUEST_TIMEZONE_HEADER, withRequestTimezone } from "./request-timezone";

describe("withRequestTimezone", () => {
  it("sets the edge's zone, replacing whatever the client sent", () => {
    const sent = new Headers({ [REQUEST_TIMEZONE_HEADER]: "Pacific/Pago_Pago", cookie: "a=1" });
    const headers = withRequestTimezone(sent, "America/Vancouver");
    expect(headers.get(REQUEST_TIMEZONE_HEADER)).toBe("America/Vancouver");
    expect(headers.get("cookie")).toBe("a=1");
  });

  it.each([undefined, "", 42])("drops a client-sent zone when the edge gives %j", (timezone) => {
    const sent = new Headers({ [REQUEST_TIMEZONE_HEADER]: "Not/AZone" });
    expect(withRequestTimezone(sent, timezone).has(REQUEST_TIMEZONE_HEADER)).toBe(false);
  });

  it("leaves the incoming headers untouched", () => {
    const sent = new Headers({ [REQUEST_TIMEZONE_HEADER]: "Pacific/Pago_Pago" });
    withRequestTimezone(sent, undefined);
    expect(sent.get(REQUEST_TIMEZONE_HEADER)).toBe("Pacific/Pago_Pago");
  });
});
