import { expect, it } from "vitest";

import { ActionError } from "@/lib/action-result";
import { parseSharingAudience } from "@/lib/privacy";

it.each(["private", "friends", "public"])("accepts the %s sharing audience", (value) => {
  expect(parseSharingAudience(value)).toBe(value);
});

it.each(["invalid", "", null, undefined, 1, { audience: "public" }])(
  "rejects an invalid sharing audience: %j",
  (value) => {
    expect(() => parseSharingAudience(value)).toThrow(ActionError);
  },
);
