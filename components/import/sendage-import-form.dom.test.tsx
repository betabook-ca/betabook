import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { fetchSendageImport } from "@/lib/sendage-import";
import type { ParsedCsv } from "@/lib/sends-import";

import { SendageImportForm } from "./sendage-import-form";

vi.mock("@/lib/sendage-import", () => ({ fetchSendageImport: vi.fn<typeof fetchSendageImport>() }));
const payload = {
  username: "climber",
  parsed: { headers: ["Climb"], rows: [{ Climb: "Test" }], derived: [], warnings: [] },
};
beforeEach(() => {
  vi.mocked(fetchSendageImport).mockReset().mockResolvedValue(structuredClone(payload));
});
function setup() {
  const onLoaded = vi.fn<(parsed: ParsedCsv, username: string) => void>();
  const onBusyChange = vi.fn<(busy: boolean) => void>();
  const rendered = render(<SendageImportForm onLoaded={onLoaded} onBusyChange={onBusyChange} />);
  return { ...rendered, onLoaded, onBusyChange };
}

it("imports the entered username and starts blank when opened again", async () => {
  const { onLoaded, onBusyChange, unmount } = setup();
  await userEvent.type(screen.getByRole("textbox"), "climber");
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  await waitFor(() => expect(onLoaded).toHaveBeenCalledExactlyOnceWith(payload.parsed, "climber"));
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

it("keeps input and offers retry after a failed download", async () => {
  vi.mocked(fetchSendageImport).mockRejectedValueOnce(new Error("Sendage unavailable"));
  const { onLoaded } = setup();
  await userEvent.type(screen.getByRole("textbox"), "https://sendage.com/user/climber");
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sendage unavailable");
  expect(screen.getByRole("textbox")).toHaveValue("https://sendage.com/user/climber");
  expect(onLoaded).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  await waitFor(() => expect(onLoaded).toHaveBeenCalledOnce());
});

it("links the support address in a failed download to a prefilled email", async () => {
  vi.mocked(fetchSendageImport).mockRejectedValueOnce(
    new Error(
      "Sendage returned an unfamiliar data format. Please try again later, or email support@betabook.ca.",
    ),
  );
  setup();
  await userEvent.type(screen.getByRole("textbox"), "climber");
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  const link = await screen.findByRole("link", { name: "support@betabook.ca" });
  expect(screen.getByRole("alert")).toContainElement(link);
  expect(link).toHaveAttribute(
    "href",
    "mailto:support@betabook.ca?subject=Sendage%20import&body=Sendage%20returned%20an%20unfamiliar%20data%20format.%20Please%20try%20again%20later%2C%20or%20email%20support%40betabook.ca.",
  );
});

it("cancels a pending download and ignores its late response", async () => {
  let resolve!: (value: typeof payload) => void;
  vi.mocked(fetchSendageImport).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { onLoaded, onBusyChange } = setup();
  await userEvent.type(screen.getByRole("textbox"), "climber");
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  expect(screen.getByRole("button", { name: "Loading sends…" })).toBeDisabled();
  const signal = vi.mocked(fetchSendageImport).mock.calls[0][1].signal;
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ ...payload, username: "late_response" }));
  expect(onLoaded).not.toHaveBeenCalled();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

it("stops a download when unmounted", async () => {
  const { unmount } = setup();
  vi.mocked(fetchSendageImport).mockReturnValue(new Promise(() => {}));
  await userEvent.type(screen.getByRole("textbox"), "climber");
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  const signal = vi.mocked(fetchSendageImport).mock.calls[0][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
});
