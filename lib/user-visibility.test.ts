import { describe, expect, it } from "vitest";

import { canViewUser } from "./user-visibility";

describe("canViewUser", () => {
  it("requires login to view a member-visible profile", () => {
    expect(canViewUser({ id: "alice", isPrivate: false }, null)).toBe(false);
    expect(canViewUser({ id: "alice", isPrivate: false }, "bob")).toBe(true);
  });

  it("blocks a signed-out viewer from a private profile", () => {
    expect(canViewUser({ id: "alice", isPrivate: true }, null)).toBe(false);
  });

  it("blocks a different signed-in viewer from a private profile", () => {
    expect(canViewUser({ id: "alice", isPrivate: true }, "bob")).toBe(false);
  });

  it("allows the owner to view their own private profile", () => {
    expect(canViewUser({ id: "alice", isPrivate: true }, "alice")).toBe(true);
  });
});
