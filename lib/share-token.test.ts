import { expect, it } from "vitest";

import { parseShareToken } from "./share-token";

const TOKEN = "4f9c2a7e1b8d6035c9e4a1f7b2d80e36";

it("accepts the shape the database issues and nothing else", () => {
  expect(parseShareToken(TOKEN)).toBe(TOKEN);
  for (const value of [
    TOKEN.toUpperCase(),
    `${TOKEN}0`,
    TOKEN.slice(0, 31),
    "../../users/owner",
    "",
    [TOKEN],
    null,
    undefined,
    42,
  ]) {
    expect(parseShareToken(value)).toBeNull();
  }
});
