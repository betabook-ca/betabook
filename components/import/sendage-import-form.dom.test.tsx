import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { fetchSendageImport } from "@/lib/sendage-import";
import type { ParsedCsv } from "@/lib/sends-import";

import { SendageImportForm } from "./sendage-import-form";

// Retry, cancel, late responses, unmount and the support link are shared with
// the other profile imports and covered in import-profile-form.dom.test.tsx.
vi.mock("@/lib/sendage-import", () => ({ fetchSendageImport: vi.fn<typeof fetchSendageImport>() }));
const payload = {
  username: "climber",
  parsed: { headers: ["Climb"], rows: [{ Climb: "Test" }], derived: [], warnings: [] },
};
beforeEach(() => {
  vi.mocked(fetchSendageImport).mockReset().mockResolvedValue(structuredClone(payload));
});
function setup() {
  const onLoaded = vi.fn<(parsed: ParsedCsv, label: string) => void>();
  const onBusyChange = vi.fn<(busy: boolean) => void>();
  const rendered = render(<SendageImportForm onLoaded={onLoaded} onBusyChange={onBusyChange} />);
  return { ...rendered, onLoaded, onBusyChange };
}

it("imports the entered username and starts blank when opened again", async () => {
  const { onLoaded, onBusyChange, unmount } = setup();
  await userEvent.type(screen.getByRole("textbox"), "climber");
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  await waitFor(() => expect(onLoaded).toHaveBeenCalledExactlyOnceWith(payload.parsed, "@climber"));
  expect(fetchSendageImport).toHaveBeenCalledWith(
    "climber",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  unmount();
  setup();
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(screen.queryByRole("button", { name: "Forget saved profile" })).not.toBeInTheDocument();
});

it("counts loaded sends with the right plural", async () => {
  vi.mocked(fetchSendageImport).mockReturnValue(new Promise(() => {}));
  setup();
  await userEvent.type(screen.getByRole("textbox"), "climber");
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  expect(screen.getByRole("status")).toHaveTextContent("Connecting to Sendage…");
  const progress = vi.mocked(fetchSendageImport).mock.calls[0][1].onProgress!;
  act(() => progress(1));
  expect(screen.getByRole("status")).toHaveTextContent(/^1 send loaded…$/);
  act(() => progress(1200));
  expect(screen.getByRole("status")).toHaveTextContent(/^1,200 sends loaded…$/);
});
