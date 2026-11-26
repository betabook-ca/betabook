import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { fetchKayaImport } from "@/lib/kaya-import";
import type { ParsedCsv } from "@/lib/sends-import";

import { KayaImportForm } from "./kaya-import-form";

// Retry, cancel, late responses, unmount and the support link are shared with
// the other profile imports and covered in import-profile-form.dom.test.tsx.
vi.mock("@/lib/kaya-import", () => ({ fetchKayaImport: vi.fn<typeof fetchKayaImport>() }));
const payload = {
  username: "climber",
  parsed: { headers: ["Climb"], rows: [{ Climb: "Test" }], derived: [], warnings: [] },
};
beforeEach(() => {
  vi.mocked(fetchKayaImport).mockReset().mockResolvedValue(structuredClone(payload));
});
function setup() {
  const onLoaded = vi.fn<(parsed: ParsedCsv, label: string) => void>();
  const onBusyChange = vi.fn<(busy: boolean) => void>();
  const rendered = render(<KayaImportForm onLoaded={onLoaded} onBusyChange={onBusyChange} />);
  return { ...rendered, onLoaded, onBusyChange };
}

it("imports the entered username and starts blank when opened again", async () => {
  const { onLoaded, onBusyChange, unmount } = setup();
  await userEvent.type(screen.getByRole("textbox"), "climber");
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  await waitFor(() => expect(onLoaded).toHaveBeenCalledExactlyOnceWith(payload.parsed, "@climber"));
  expect(fetchKayaImport).toHaveBeenCalledWith(
    "climber",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  unmount();
  setup();
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(screen.queryByRole("button", { name: "Forget saved profile" })).not.toBeInTheDocument();
});

it("updates the live counts and retry notice while keeping cancel available", async () => {
  vi.mocked(fetchKayaImport).mockReturnValue(new Promise(() => {}));
  setup();
  expect(screen.getByText(/Large histories can take a few seconds/)).toBeVisible();
  await userEvent.type(screen.getByRole("textbox"), "suzilu");
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  const progress = vi.mocked(fetchKayaImport).mock.calls[0][1].onProgress!;
  act(() => progress({ discipline: "boulder", loaded: 350, total: 872, retry: null }));
  expect(screen.getByRole("status")).toHaveTextContent("350 of 872 boulders loaded");
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "872");
  act(() =>
    progress({
      discipline: "boulder",
      loaded: 350,
      total: 872,
      retry: { reason: "rate-limit", retryAt: Date.now() + 20_000, attempt: 1 },
    }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("KAYA asked us to slow down");
  expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
