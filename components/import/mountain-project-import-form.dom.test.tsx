import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { fetchMountainProjectImport } from "@/lib/mountain-project-import";
import type { ParsedCsv } from "@/lib/sends-import";

import { MountainProjectImportForm } from "./mountain-project-import-form";

vi.mock("@/lib/mountain-project-import", () => ({
  fetchMountainProjectImport: vi.fn<typeof fetchMountainProjectImport>(),
}));
const payload = {
  username: "200226064",
  displayName: "@eric-bonilla",
  parsed: { headers: ["Route"], rows: [{ Route: "Double Play" }], derived: [], warnings: [] },
};
beforeEach(() => {
  vi.mocked(fetchMountainProjectImport).mockReset().mockResolvedValue(structuredClone(payload));
});
function setup() {
  const onLoaded = vi.fn<(parsed: ParsedCsv, label: string) => void>();
  const onBusyChange = vi.fn<(busy: boolean) => void>();
  const rendered = render(
    <MountainProjectImportForm onLoaded={onLoaded} onBusyChange={onBusyChange} />,
  );
  return { ...rendered, onLoaded, onBusyChange };
}

it("imports a pasted profile link and reports the resolved profile name", async () => {
  const { onLoaded, onBusyChange, unmount } = setup();
  const link = "https://www.mountainproject.com/user/200226064/eric-bonilla/ticks";
  await userEvent.type(screen.getByRole("textbox"), link);
  await userEvent.click(screen.getByRole("button", { name: "Load ticks" }));
  await waitFor(() =>
    expect(onLoaded).toHaveBeenCalledExactlyOnceWith(payload.parsed, "@eric-bonilla"),
  );
  expect(fetchMountainProjectImport).toHaveBeenCalledWith(
    link,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(screen.getByRole("textbox")).toHaveValue("200226064");
  expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  unmount();
  setup();
  expect(screen.getByRole("textbox")).toHaveValue("");
});

it("reports an empty tick list instead of continuing to the wizard", async () => {
  vi.mocked(fetchMountainProjectImport).mockResolvedValueOnce({
    ...structuredClone(payload),
    parsed: { headers: ["Route"], rows: [], derived: [], warnings: [] },
  });
  const { onLoaded } = setup();
  await userEvent.type(screen.getByRole("textbox"), "200226064");
  await userEvent.click(screen.getByRole("button", { name: "Load ticks" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No ticks found on this Mountain Project profile.",
  );
  expect(onLoaded).not.toHaveBeenCalled();
});

it("keeps input and offers retry after a failed download", async () => {
  vi.mocked(fetchMountainProjectImport).mockRejectedValueOnce(
    new Error("Mountain Project is temporarily unavailable. Please try again later."),
  );
  const { onLoaded } = setup();
  await userEvent.type(screen.getByRole("textbox"), "200226064");
  await userEvent.click(screen.getByRole("button", { name: "Load ticks" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
  expect(screen.getByRole("textbox")).toHaveValue("200226064");
  expect(onLoaded).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Load ticks" }));
  await waitFor(() => expect(onLoaded).toHaveBeenCalledOnce());
});

it("links the support address in a failed download to a prefilled email", async () => {
  vi.mocked(fetchMountainProjectImport).mockRejectedValueOnce(
    new Error(
      "Mountain Project returned an unfamiliar tick export. Download it as a CSV and upload that file instead, or email support@betabook.ca.",
    ),
  );
  setup();
  await userEvent.type(screen.getByRole("textbox"), "200226064");
  await userEvent.click(screen.getByRole("button", { name: "Load ticks" }));
  const link = await screen.findByRole("link", { name: "support@betabook.ca" });
  expect(screen.getByRole("alert")).toContainElement(link);
  expect(link).toHaveAttribute(
    "href",
    expect.stringContaining("subject=Mountain%20Project%20import"),
  );
});

it("shows downloaded progress and cancels a pending download", async () => {
  let resolve!: (value: typeof payload) => void;
  vi.mocked(fetchMountainProjectImport).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { onLoaded, onBusyChange } = setup();
  await userEvent.type(screen.getByRole("textbox"), "200226064");
  await userEvent.click(screen.getByRole("button", { name: "Load ticks" }));
  expect(screen.getByRole("button", { name: "Loading ticks…" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Connecting to Mountain Project…");
  const options = vi.mocked(fetchMountainProjectImport).mock.calls[0][1];
  await act(async () => options.onProgress?.(120 * 1024));
  expect(screen.getByRole("status")).toHaveTextContent("120 KB of ticks loaded…");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(options.signal.aborted).toBe(true);
  await act(async () => resolve({ ...payload, displayName: "@late-response" }));
  expect(onLoaded).not.toHaveBeenCalled();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

it("stops a download when unmounted", async () => {
  const { unmount } = setup();
  vi.mocked(fetchMountainProjectImport).mockReturnValue(new Promise(() => {}));
  await userEvent.type(screen.getByRole("textbox"), "200226064");
  await userEvent.click(screen.getByRole("button", { name: "Load ticks" }));
  const signal = vi.mocked(fetchMountainProjectImport).mock.calls[0][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
});
