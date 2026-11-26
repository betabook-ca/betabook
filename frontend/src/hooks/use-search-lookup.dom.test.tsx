import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useSearchLookup, type LookupFetcher } from "./use-search-lookup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it("debounces the current query, aborts replaced requests and ignores their late replies", async () => {
  const fetcher = vi.fn<LookupFetcher<string>>();
  let oldReply!: (items: string[]) => void;
  fetcher
    .mockReturnValueOnce(
      new Promise((resolve) => {
        oldReply = resolve;
      }),
    )
    .mockResolvedValueOnce(["new-id"]);
  const { result, rerender, unmount } = renderHook(
    ({ query }) => useSearchLookup({ query, fetcher }),
    { initialProps: { query: "old" } },
  );
  await act(() => vi.advanceTimersByTimeAsync(299));
  expect(fetcher).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(fetcher).toHaveBeenCalledOnce();
  const oldSignal = fetcher.mock.calls[0][1];
  rerender({ query: "new" });
  expect(oldSignal.aborted).toBe(true);
  expect(result.current.items).toEqual([]);
  expect(result.current.status).toBe("loading");
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(result.current.items).toEqual(["new-id"]);
  await act(async () => oldReply(["stale-id"]));
  expect(result.current.items).toEqual(["new-id"]);
  unmount();
  expect(fetcher.mock.calls[1][1].aborted).toBe(true);
});
it("retries without another debounce and clears stale items when scope or enabled state changes", async () => {
  const fetcher = vi
    .fn<LookupFetcher<string>>()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue(["alex"]);
  const { result, rerender } = renderHook(
    ({ scope, enabled }) => useSearchLookup({ query: "Alex", fetcher, scope, enabled }),
    { initialProps: { scope: "", enabled: true } },
  );
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(result.current.status).toBe("error");
  act(() => result.current.retry());
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(result.current.items).toEqual(["alex"]);
  rerender({ scope: "alex", enabled: true });
  expect(result.current.items).toEqual([]);
  rerender({ scope: "alex", enabled: false });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(result.current.status).toBe("idle");
});
