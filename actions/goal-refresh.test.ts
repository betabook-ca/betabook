import { env } from "cloudflare:test";
import { expect, it, vi } from "vitest";

import { createDb } from "@/db/client";

const callbacks = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => {
    callbacks.push(callback);
  },
}));

it("defers goal recomputation until after the response", async () => {
  const { scheduleGoalRefresh } =
    await vi.importActual<typeof import("./goal-refresh")>("./goal-refresh");
  const db = createDb(env.DB);
  const read = vi.spyOn(db, "all");
  await scheduleGoalRefresh(db, "no-goals");
  expect(read).not.toHaveBeenCalled();
  expect(callbacks).toHaveLength(1);
  await callbacks.pop()?.();
  expect(read).toHaveBeenCalled();
  read.mockRestore();
});
