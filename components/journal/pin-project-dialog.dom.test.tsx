import { useOverlayState } from "@heroui/react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { pinProject } from "@/actions";
import type { OpenProject } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";
import { stubViewport } from "@/test/viewport";

import { PinProjectDialog } from "./pin-project-dialog";

type Listener = () => void;

/** jsdom has no visual viewport; this stands in for one so the dialog's own
 * compact branch is exercised. What the collapsed layout measures is a
 * geometry question and stays in Playwright. */
function stubVisualViewport(height: number) {
  const listeners = new Set<Listener>();
  const viewport = {
    height,
    offsetTop: 0,
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  };
  Object.defineProperty(window, "visualViewport", {
    value: viewport,
    configurable: true,
    writable: true,
  });
  return {
    resizeTo(next: number) {
      viewport.height = next;
      act(() => {
        for (const listener of listeners) listener();
      });
    },
  };
}

afterEach(() => {
  Reflect.deleteProperty(window, "visualViewport");
  vi.unstubAllGlobals();
});

vi.mock("@/actions", () => ({
  pinProject: vi.fn<() => Promise<ActionResult>>(),
}));

const refresh = vi.fn<() => void>();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/users/climber/projects",
  useSearchParams: () => new URLSearchParams(),
}));

function suggestion(overrides: Partial<OpenProject> & { climbId: number }): OpenProject {
  return {
    climbName: "Moon Slab",
    climbType: "boulder",
    climbGrade: 5,
    climbBrokenOn: null,
    areaId: 3,
    areaName: "Cedar Block",
    sessionCount: 4,
    noteCount: 2,
    firstSession: "2026-03-01",
    lastSession: "2026-09-01",
    ...overrides,
  };
}

const suggestions: OpenProject[] = [
  suggestion({ climbId: 1 }),
  suggestion({ climbId: 2, climbName: "Ash Crack", climbType: "trad", sessionCount: 1 }),
];

const NO_PINS: number[] = [];

function Example({
  suggested = suggestions,
  pinnedClimbIds = NO_PINS,
}: {
  suggested?: OpenProject[];
  pinnedClimbIds?: number[];
}) {
  const state = useOverlayState({ defaultOpen: true });
  return <PinProjectDialog state={state} suggestions={suggested} pinnedClimbIds={pinnedClimbIds} />;
}

it("offers each unsent climb with the session count that makes it a candidate", async () => {
  render(<Example />);

  const list = await screen.findByRole("list", { name: "Suggested projects" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("Moon Slab");
  expect(rows[0]).toHaveTextContent("4 sessions");
  // Singular, so the count reads as a sentence rather than "1 sessions".
  expect(rows[1]).toHaveTextContent("1 session");
});

it("pins the suggestion that was pressed and closes", async () => {
  const user = userEvent.setup();
  vi.mocked(pinProject).mockResolvedValue({ ok: true, value: undefined });
  render(<Example />);

  await user.click(await screen.findByRole("button", { name: "Pin Ash Crack" }));

  await waitFor(() => expect(pinProject).toHaveBeenCalledWith(2));
  expect(pinProject).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("keeps the dialog open and explains a refused pin", async () => {
  const user = userEvent.setup();
  vi.mocked(pinProject).mockResolvedValue({
    ok: false,
    error: "You can pin up to 100 projects — unpin one to add another",
  });
  render(<Example />);

  await user.click(await screen.findByRole("button", { name: "Pin Moon Slab" }));

  expect(await screen.findByText(/You can pin up to 100 projects/)).toBeVisible();
  // Still open, so the climber can unpin elsewhere or choose differently.
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Suggested projects" })).toBeInTheDocument();
});

it("locks the other suggestions while a pin is in flight, so none double-fires", async () => {
  const user = userEvent.setup();
  let finish: (result: ActionResult) => void = () => {};
  vi.mocked(pinProject).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Example />);

  await user.click(await screen.findByRole("button", { name: "Pin Moon Slab" }));

  // The disabled state is what actually stops a second pick on this path;
  // handlePin's pending guard covers the search results, which stay enabled.
  expect(screen.getByRole("button", { name: "Pin Ash Crack" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Pin Ash Crack" }));

  expect(pinProject).toHaveBeenCalledTimes(1);
  expect(pinProject).toHaveBeenCalledWith(1);

  finish({ ok: true, value: undefined });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("hides the suggestions once the climber starts searching for something else", async () => {
  const user = userEvent.setup();
  render(<Example />);

  expect(await screen.findByRole("list", { name: "Suggested projects" })).toBeInTheDocument();

  await user.type(screen.getByRole("searchbox"), "giant");

  await waitFor(() =>
    expect(screen.queryByRole("list", { name: "Suggested projects" })).not.toBeInTheDocument(),
  );
});

it("says nothing about suggestions when there are none to make", async () => {
  render(<Example suggested={[]} />);

  await screen.findByRole("dialog");
  expect(screen.queryByRole("list", { name: "Suggested projects" })).not.toBeInTheDocument();
  expect(screen.queryByText(/worked but not sent/)).not.toBeInTheDocument();
});

it("takes the whole phone screen rather than a sheet", async () => {
  // A search field over a result list: at 85vh with a keyboard up a sheet caps
  // the list around three results. Fullscreen also means the search can't be
  // swiped away mid-query, which is what losing the drag handle represents.
  stubViewport("mobile");
  const { container } = render(<Example />);

  await screen.findByRole("dialog");
  expect(container.ownerDocument.querySelector("[data-slot=drawer-handle]")).toBeNull();
});

it("offers the same suggestions and pins from the centered desktop variant", async () => {
  // ResponsiveDialog swaps the whole subtree across `md`, so the desktop side
  // is a different tree and needs its own coverage; jsdom reads mobile.
  stubViewport("desktop");
  const user = userEvent.setup();
  vi.mocked(pinProject).mockResolvedValue({ ok: true, value: undefined });
  render(<Example />);

  await screen.findByRole("dialog");
  await user.click(await screen.findByRole("button", { name: "Pin Ash Crack" }));

  await waitFor(() => expect(pinProject).toHaveBeenCalledWith(2));
});

it("drops the full filters for plain chips when a keyboard takes the viewport", async () => {
  // Every row above the results costs a result, and the keyboard has already
  // taken half the screen.
  const viewport = stubVisualViewport(812);
  render(<Example />);

  await screen.findByRole("dialog");
  expect(screen.getByRole("button", { name: /Sort by/ })).toBeInTheDocument();

  viewport.resizeTo(470);

  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /Sort by/ })).not.toBeInTheDocument(),
  );
  // The lighter discipline chips remain, and so does what the space is for.
  expect(screen.getByRole("button", { name: "Boulder" })).toBeInTheDocument();
  expect(screen.getByRole("searchbox")).toBeVisible();
  expect(screen.getByRole("list", { name: "Suggested projects" })).toBeInTheDocument();
});
