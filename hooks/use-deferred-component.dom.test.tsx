import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useDeferredComponent } from "./use-deferred-component";

function Loaded() {
  return <p>Loaded feature</p>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("contains a failed preload and retries successfully on the next interaction", async () => {
  const loader = vi
    .fn<() => Promise<typeof Loaded>>()
    .mockRejectedValueOnce(new Error("Chunk unavailable"))
    .mockResolvedValue(Loaded);
  const { result } = renderHook(() => useDeferredComponent(loader));

  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(result.current.Component).toBeNull();
  expect(result.current.failed).toBe(true);
  await act(async () => result.current.load());
  expect(loader).toHaveBeenCalledTimes(2);
  expect(result.current.Component).toBe(Loaded);
  expect(result.current.failed).toBe(false);
});

it("shares an in-flight preload with repeated opens and reuses the loaded component", async () => {
  let complete!: (component: typeof Loaded) => void;
  const loader = vi.fn<() => Promise<typeof Loaded>>(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const { result } = renderHook(() => useDeferredComponent(loader));

  await act(() => vi.advanceTimersByTimeAsync(300));
  await act(async () => {
    result.current.load();
    result.current.load();
  });
  expect(loader).toHaveBeenCalledOnce();
  await act(async () => complete(Loaded));
  await act(async () => result.current.load());
  expect(result.current.Component).toBe(Loaded);
  expect(loader).toHaveBeenCalledOnce();
});
