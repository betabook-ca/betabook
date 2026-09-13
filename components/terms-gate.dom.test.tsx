import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";
import { TERMS_REQUIRED_EVENT, TERMS_VERSION } from "@/lib/terms";

import { TermsGate } from "./terms-gate";

const navigation = vi.hoisted(() => ({
  path: "/friends",
  refresh: vi.fn<() => void>(),
  replace: vi.fn<(path: string) => void>(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.path,
  useRouter: () => navigation,
}));
vi.mock("@/actions/terms", () => ({ acceptTerms: vi.fn<() => Promise<ActionResult>>() }));
beforeEach(() => {
  navigation.path = "/friends";
  navigation.refresh.mockReset();
  navigation.replace.mockReset();
  window.history.replaceState({}, "", "/friends?view=requests");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("opens an in-place dialog and makes the background inaccessible until acceptance", async () => {
  const onAccept = vi
    .fn<(version: unknown, agreed: unknown) => Promise<ActionResult>>()
    .mockResolvedValue({ ok: true, value: undefined });
  const user = userEvent.setup();
  render(
    <TermsGate viewerId="u" initiallyRequired onAccept={onAccept}>
      <button type="button">Member action</button>
    </TermsGate>,
  );
  const dialog = screen.getByRole("dialog", { name: "Terms of Service" });
  expect(screen.queryByRole("button", { name: "Member action" })).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Member action", hidden: true }).closest("[inert]"),
  ).not.toBeNull();
  expect(window.location.pathname + window.location.search).toBe("/friends?view=requests");
  await user.click(within(dialog).getByRole("checkbox", { name: /I agree/ }));
  await user.click(within(dialog).getByRole("button", { name: "Accept and continue" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(onAccept).toHaveBeenCalledWith(TERMS_VERSION, true);
  expect(screen.getByRole("button", { name: "Member action" })).toBeVisible();
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(navigation.refresh).toHaveBeenCalled();
});

it("shows the server's new version in an already-open session without losing a draft", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(0);
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ userId: "u", required: false }))
    .mockResolvedValueOnce(
      Response.json({
        userId: "u",
        required: true,
        version: "2027-01-01",
        versionLabel: "January 1, 2027",
        previousVersion: TERMS_VERSION,
      }),
    )
    .mockResolvedValue(Response.json({ userId: "u", required: false }));
  vi.stubGlobal("fetch", transport);
  const user = userEvent.setup();
  const onAccept = vi
    .fn<(version: unknown, agreed: unknown) => Promise<ActionResult>>()
    .mockResolvedValue({ ok: true, value: undefined });
  render(
    <TermsGate viewerId="u" initiallyRequired={false} onAccept={onAccept}>
      <input aria-label="Draft" />
    </TermsGate>,
  );
  await user.type(screen.getByRole("textbox", { name: "Draft" }), "My unsaved note");
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  now.mockReturnValue(61_000);
  await user.click(screen.getByRole("textbox", { name: "Draft" }));
  const dialog = await screen.findByRole("dialog", { name: "Terms of Service" });
  expect(within(dialog).getByRole("link", { name: "Read the Terms of Service" })).toHaveAttribute(
    "href",
    "/terms/2027-01-01",
  );
  expect(within(dialog).getByText(/January 1, 2027/)).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Draft", hidden: true })).toHaveValue(
    "My unsaved note",
  );
  await user.click(within(dialog).getByRole("checkbox", { name: /I agree/ }));
  await user.click(within(dialog).getByRole("button", { name: "Accept and continue" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("textbox", { name: "Draft" })).toHaveValue("My unsaved note");
  expect(onAccept).toHaveBeenCalledWith("2027-01-01", true);
  expect(navigation.replace).not.toHaveBeenCalled();
});

it("opens immediately after a denied data request without navigating away", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(Response.json({ userId: "u", required: false })),
  );
  render(
    <TermsGate viewerId="u" initiallyRequired={false}>
      <p>Member data</p>
    </TermsGate>,
  );
  // apiFetch emits this transport event; it is not a user input event.
  fireEvent(window, new Event(TERMS_REQUIRED_EVENT));
  expect(screen.getByRole("dialog", { name: "Terms of Service" })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/friends?view=requests");
});

it("keeps a newer revision open when an older acceptance request finishes", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ userId: "u", required: false }))
    .mockResolvedValueOnce(Response.json({ userId: "u", required: true }))
    .mockResolvedValue(
      Response.json({
        userId: "u",
        required: true,
        version: "2027-01-01",
        versionLabel: "January 1, 2027",
      }),
    );
  vi.stubGlobal("fetch", transport);
  let resolve!: (result: ActionResult) => void;
  const onAccept = vi
    .fn<(version: unknown, agreed: unknown) => Promise<ActionResult>>()
    .mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
  const user = userEvent.setup();
  render(
    <TermsGate viewerId="u" initiallyRequired={false} onAccept={onAccept}>
      <p>Member content</p>
    </TermsGate>,
  );
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  fireEvent(window, new Event(TERMS_REQUIRED_EVENT));
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole("checkbox", { name: /I agree/ }));
  await user.click(screen.getByRole("button", { name: "Accept and continue" }));
  fireEvent.focus(window);
  await screen.findByText(/January 1, 2027/);
  await act(async () => resolve({ ok: true, value: undefined }));
  expect(screen.getByRole("dialog", { name: "Terms of Service" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Read the Terms of Service" })).toHaveAttribute(
    "href",
    "/terms/2027-01-01",
  );
  expect(screen.getByRole("checkbox", { name: /I agree/ })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Accept and continue" })).toBeDisabled();
  expect(onAccept).toHaveBeenCalledWith(TERMS_VERSION, true);
});

it.each(["/terms", "/terms/2026-09-09", "/contact", "/accept-terms"])(
  "does not cover %s with another modal",
  (path) => {
    navigation.path = path;
    const transport = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", transport);
    render(
      <TermsGate viewerId="u" initiallyRequired>
        <p>Readable content</p>
      </TermsGate>,
    );
    expect(screen.getByText("Readable content")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(transport).not.toHaveBeenCalled();
  },
);

it("ignores an old viewer's response after switching accounts", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue(Response.json({ userId: "new", required: false })),
  );
  const view = render(
    <TermsGate viewerId="old" initiallyRequired={false}>
      <p>Old member</p>
    </TermsGate>,
  );
  view.rerender(
    <TermsGate viewerId="new" initiallyRequired={false}>
      <p>New member</p>
    </TermsGate>,
  );
  await act(async () => resolve(Response.json({ userId: "old", required: true })));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("New member")).toBeVisible();
});
