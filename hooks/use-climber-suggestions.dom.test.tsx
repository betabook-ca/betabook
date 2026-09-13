import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { SuggestedClimberRow } from "@/db/queries";

import { useClimberSuggestions } from "./use-climber-suggestions";

const climber = (id: string, mutualFriendCount = 1): SuggestedClimberRow => ({
  id,
  name: `Climber ${id}`,
  image: null,
  friendshipStatus: "none",
  mutualFriendCount,
});
const response = (climbers: SuggestedClimberRow[], ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => ({ climbers }),
});
type Fetch = (input: string, init?: RequestInit) => Promise<ReturnType<typeof response>>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
afterEach(() => {
  vi.unstubAllGlobals();
});

it("shows server suggestions without a request and reloads them after leaving the empty climber search", async () => {
  const fetch = vi.fn<Fetch>(async () => response([climber("fresh")]));
  vi.stubGlobal("fetch", fetch);
  const { result, rerender } = renderHook(
    ({ enabled }) => useClimberSuggestions(enabled, [climber("server", 2)]),
    { initialProps: { enabled: true } },
  );
  expect(result.current).toEqual([climber("server", 2)]);
  rerender({ enabled: false });
  expect(result.current).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
  rerender({ enabled: true });
  await waitFor(() => expect(result.current).toEqual([climber("fresh")]));
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]).toEqual([
    "/api/friends/suggestions",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  ]);
});

it("loads on demand, ignores a response for a search already left, and stays empty on failure", async () => {
  const stale = deferred<ReturnType<typeof response>>();
  const fetch = vi
    .fn<Fetch>()
    .mockImplementationOnce(() => stale.promise)
    .mockResolvedValueOnce(response([], false));
  vi.stubGlobal("fetch", fetch);
  const { result, rerender } = renderHook(({ enabled }) => useClimberSuggestions(enabled, null), {
    initialProps: { enabled: false },
  });
  expect(fetch).not.toHaveBeenCalled();
  rerender({ enabled: true });
  expect(fetch).toHaveBeenCalledOnce();
  const signal = fetch.mock.calls[0][1]?.signal;
  rerender({ enabled: false });
  expect(signal?.aborted).toBe(true);
  rerender({ enabled: true });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  // Drain the abandoned request's response handling before asserting nothing was applied.
  await act(async () => {
    stale.resolve(response([climber("stale")]));
    await new Promise((resolve) => setTimeout(resolve));
  });
  expect(result.current).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(2);
});
