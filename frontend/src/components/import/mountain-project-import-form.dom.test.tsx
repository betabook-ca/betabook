import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { fetchMountainProjectImport } from "@/lib/mountain-project-import";
import type { ParsedCsv } from "@/lib/sends-import";

import { MountainProjectImportForm } from "./mountain-project-import-form";

// Retry, cancel, late responses, unmount and the support link are shared with
// the other profile imports and covered in import-profile-form.dom.test.tsx.
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

it("shows the downloaded size while loading", async () => {
  vi.mocked(fetchMountainProjectImport).mockReturnValue(new Promise(() => {}));
  setup();
  await userEvent.type(screen.getByRole("textbox"), "200226064");
  await userEvent.click(screen.getByRole("button", { name: "Load ticks" }));
  expect(screen.getByRole("button", { name: "Loading ticks…" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Connecting to Mountain Project…");
  const options = vi.mocked(fetchMountainProjectImport).mock.calls[0][1];
  await act(async () => options.onProgress?.(120 * 1024));
  expect(screen.getByRole("status")).toHaveTextContent("120 KB of ticks loaded…");
});
