import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { KayaImportProgress } from "./kaya-import-progress";

afterEach(() => vi.useRealTimers());
it("shows counts, loading guidance, and a countdown that resets for each retry", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
  const progress = { discipline: "boulder" as const, loaded: 350, total: 872, retry: null };
  const { rerender, unmount } = render(<KayaImportProgress progress={progress} />);
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "350");
  expect(screen.getByRole("status")).toHaveTextContent("350 of 872 boulders loaded");
  expect(screen.getByText(/Large histories can take a few seconds/)).toBeVisible();
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  rerender(
    <KayaImportProgress
      progress={{
        ...progress,
        retry: { attempt: 1, reason: "rate-limit", retryAt: Date.now() + 5_000 },
      }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "KAYA asked us to slow down. Retrying in 5s (1/3)",
  );
  await act(async () => vi.advanceTimersByTimeAsync(5_000));
  expect(screen.getByRole("status")).toHaveTextContent("Trying again…");
  rerender(
    <KayaImportProgress
      progress={{
        ...progress,
        retry: { attempt: 2, reason: "unavailable", retryAt: Date.now() + 10_000 },
      }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Retrying in 10s (2/3)");
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
