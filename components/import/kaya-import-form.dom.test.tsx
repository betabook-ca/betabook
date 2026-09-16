import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { fetchKayaImport } from "@/lib/kaya-import";
import type { ParsedCsv } from "@/lib/sends-import";

import { KayaImportForm } from "./kaya-import-form";

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

it("keeps input and offers retry after a failed download", async () => {
  vi.mocked(fetchKayaImport).mockRejectedValueOnce(new Error("KAYA unavailable"));
  const { onLoaded } = setup();
  await userEvent.type(screen.getByRole("textbox"), "https://kaya-app.kayaclimb.com/user/climber");
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("KAYA unavailable");
  expect(screen.getByRole("textbox")).toHaveValue("https://kaya-app.kayaclimb.com/user/climber");
  expect(onLoaded).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  await waitFor(() => expect(onLoaded).toHaveBeenCalledOnce());
});

it("links the support address in a failed download to a prefilled email", async () => {
  vi.mocked(fetchKayaImport).mockRejectedValueOnce(
    new Error(
      "This KAYA history is too large for a direct import. Email support@betabook.ca for help importing it.",
    ),
  );
  setup();
  await userEvent.type(screen.getByRole("textbox"), "climber");
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  const link = await screen.findByRole("link", { name: "support@betabook.ca" });
  expect(screen.getByRole("alert")).toContainElement(link);
  expect(link).toHaveAttribute(
    "href",
    "mailto:support@betabook.ca?subject=KAYA%20import&body=This%20KAYA%20history%20is%20too%20large%20for%20a%20direct%20import.%20Email%20support%40betabook.ca%20for%20help%20importing%20it.",
  );
});

it("cancels a pending download and ignores its late response", async () => {
  let resolve!: (value: typeof payload) => void;
  vi.mocked(fetchKayaImport).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { onLoaded, onBusyChange } = setup();
  await userEvent.type(screen.getByRole("textbox"), "climber");
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  expect(screen.getByRole("button", { name: "Loading sends…" })).toBeDisabled();
  const signal = vi.mocked(fetchKayaImport).mock.calls[0][1].signal;
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ ...payload, username: "late_response" }));
  expect(onLoaded).not.toHaveBeenCalled();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

it("stops a download when unmounted", async () => {
  const { unmount } = setup();
  vi.mocked(fetchKayaImport).mockReturnValue(new Promise(() => {}));
  await userEvent.type(screen.getByRole("textbox"), "climber");
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  const signal = vi.mocked(fetchKayaImport).mock.calls[0][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
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
