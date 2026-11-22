import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import type { ParsedCsv } from "@/lib/sends-import";

import { ImportProfileForm } from "./import-profile-form";
import type { ImportProfileOptions } from "./use-import-profile";

// The lifecycle every profile import shares. Service-specific wording,
// progress and links are covered beside each form.
type Fetch = ImportProfileOptions<number>["fetchProfile"];
type Result = Awaited<ReturnType<Fetch>>;
const fetchProfile = vi.fn<Fetch>();
const payload: Result = {
  username: "climber",
  parsed: { headers: ["Climb"], rows: [{ Climb: "Test" }], derived: [], warnings: [] },
};
beforeEach(() => {
  fetchProfile.mockReset().mockResolvedValue(structuredClone(payload));
});

function setup() {
  const onLoaded = vi.fn<(parsed: ParsedCsv, label: string) => void>();
  const onBusyChange = vi.fn<(busy: boolean) => void>();
  const rendered = render(
    <ImportProfileForm<number>
      service="Sendage"
      initialUsername=""
      initialProgress={0}
      disabled={false}
      emptyMessage="No sends found."
      fetchProfile={fetchProfile}
      onLoaded={onLoaded}
      onBusyChange={onBusyChange}
      description="Load your sends."
      inputLabel="Username"
      placeholder="your-username"
      submitLabel="Load sends"
      busyLabel="Loading sends…"
      footnote="No login needed."
      hideFootnoteWhileBusy
      renderProgress={(count) => `${count} loaded`}
    />,
  );
  return { ...rendered, onLoaded, onBusyChange };
}

async function submit(value = "climber") {
  await userEvent.type(screen.getByRole("textbox", { name: "Username" }), value);
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
}

it("keeps input and offers retry after a failed download", async () => {
  fetchProfile.mockRejectedValueOnce(new Error("Service unavailable"));
  const { onLoaded } = setup();
  await submit("https://example.com/user/climber");
  expect(await screen.findByRole("alert")).toHaveTextContent("Service unavailable");
  expect(screen.getByRole("textbox")).toHaveValue("https://example.com/user/climber");
  expect(onLoaded).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  await waitFor(() => expect(onLoaded).toHaveBeenCalledExactlyOnceWith(payload.parsed, "@climber"));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("links the support address in a failed download to an email about that service", async () => {
  fetchProfile.mockRejectedValueOnce(
    new Error("Upload a CSV instead, or email support@betabook.ca."),
  );
  setup();
  await submit();
  const link = await screen.findByRole("link", { name: "support@betabook.ca" });
  expect(screen.getByRole("alert")).toContainElement(link);
  expect(link).toHaveAttribute(
    "href",
    "mailto:support@betabook.ca?subject=Sendage%20import&body=Upload%20a%20CSV%20instead%2C%20or%20email%20support%40betabook.ca.",
  );
});

it("reports an empty profile instead of loading it", async () => {
  fetchProfile.mockResolvedValueOnce({
    ...structuredClone(payload),
    parsed: { ...payload.parsed, rows: [] },
  });
  const { onLoaded } = setup();
  await submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("No sends found.");
  expect(onLoaded).not.toHaveBeenCalled();
});

it("shows progress while loading, then cancels and ignores the late response", async () => {
  let resolve!: (value: Result) => void;
  fetchProfile.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { onLoaded, onBusyChange } = setup();
  expect(screen.getByText("No login needed.")).toBeVisible();
  await submit();
  expect(screen.getByRole("button", { name: "Loading sends…" })).toBeDisabled();
  expect(screen.getByRole("textbox")).toBeDisabled();
  expect(screen.queryByText("No login needed.")).not.toBeInTheDocument();
  const { signal, onProgress } = fetchProfile.mock.calls[0][1];
  act(() => onProgress(12));
  expect(screen.getByRole("status")).toHaveTextContent("12 loaded");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(signal.aborted).toBe(true);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await act(async () => resolve({ ...payload, username: "late_response" }));
  expect(onLoaded).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toHaveValue("climber");
  expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
});

it("stops a download when unmounted", async () => {
  fetchProfile.mockReturnValue(new Promise(() => {}));
  const { unmount } = setup();
  await submit();
  const { signal } = fetchProfile.mock.calls[0][1];
  unmount();
  expect(signal.aborted).toBe(true);
});
