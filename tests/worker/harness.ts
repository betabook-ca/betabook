import assert from "node:assert/strict";

import type { TestHarness } from "wrangler";

export type SmokeResponse = Awaited<ReturnType<TestHarness["fetch"]>>;
export type SmokeFetch = (
  path: string,
  init?: Parameters<TestHarness["fetch"]>[1],
) => Promise<SmokeResponse>;
export interface SmokeServer {
  fetch: SmokeFetch;
}
export interface SmokeContext {
  server: SmokeServer;
  db: D1Database;
  signIn: (id: string) => Promise<string>;
}

export function required<T>(value: T | null | undefined): T {
  assert.ok(value != null, "expected fixture data");
  return value;
}
