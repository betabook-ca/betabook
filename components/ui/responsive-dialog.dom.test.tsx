import { useOverlayState } from "@heroui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import { stubViewport } from "@/test/viewport";

import { ResponsiveDialog } from "./responsive-dialog";

function Example({
  isPending = false,
  onClose,
  presentation,
}: {
  isPending?: boolean;
  onClose?: () => void;
  presentation?: "sheet" | "fullscreen";
}) {
  const state = useOverlayState({ defaultOpen: true });
  return (
    <ResponsiveDialog
      state={state}
      title="Report as broken"
      isPending={isPending}
      onClose={onClose}
      presentation={presentation}
    >
      <label>
        What happened
        <input name="reason" />
      </label>
    </ResponsiveDialog>
  );
}

it("names the dialog the same on either side of the breakpoint", async () => {
  stubViewport("mobile");
  const { unmount } = render(<Example />);
  expect(await screen.findByRole("dialog", { name: "Report as broken" })).toBeInTheDocument();
  unmount();

  stubViewport("desktop");
  render(<Example />);
  expect(await screen.findByRole("dialog", { name: "Report as broken" })).toBeInTheDocument();
});

it("offers the sheet's drag handle only on a phone", async () => {
  stubViewport("mobile");
  const { container, unmount } = render(<Example />);
  await screen.findByRole("dialog");
  expect(container.ownerDocument.querySelector("[data-slot=drawer-handle]")).not.toBeNull();
  unmount();

  stubViewport("desktop");
  const desktop = render(<Example />);
  await screen.findByRole("dialog");
  expect(desktop.container.ownerDocument.querySelector("[data-slot=drawer-handle]")).toBeNull();
});

it("drops the drag handle when the phone variant takes the whole screen", async () => {
  stubViewport("mobile");
  const { container } = render(<Example presentation="fullscreen" />);
  await screen.findByRole("dialog");
  expect(container.ownerDocument.querySelector("[data-slot=drawer-handle]")).toBeNull();
});

it("refuses to close while a submit is in flight", async () => {
  stubViewport("mobile");
  const user = userEvent.setup();
  const onClose = vi.fn<() => void>();
  render(<Example isPending onClose={onClose} />);

  const dialog = await screen.findByRole("dialog");
  await user.keyboard("{Escape}");

  expect(dialog).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});

it("reports the close so the body can reset itself", async () => {
  stubViewport("mobile");
  const user = userEvent.setup();
  const onClose = vi.fn<() => void>();
  render(<Example onClose={onClose} />);

  await screen.findByRole("dialog");
  await user.keyboard("{Escape}");

  expect(onClose).toHaveBeenCalledOnce();
});

it("mounts the body only while open, so a reopened form starts clean", async () => {
  stubViewport("mobile");
  const user = userEvent.setup();

  function Reopenable() {
    const state = useOverlayState();
    const [opened, setOpened] = useState(0);
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setOpened((count) => count + 1);
            state.open();
          }}
        >
          Open
        </button>
        <span data-testid="opened">{opened}</span>
        <ResponsiveDialog state={state} title="Report as broken">
          <input aria-label="What happened" />
        </ResponsiveDialog>
      </>
    );
  }

  render(<Reopenable />);
  expect(screen.queryByLabelText("What happened")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Open" }));
  await user.type(await screen.findByLabelText("What happened"), "flake came off");
  expect(await screen.findByLabelText("What happened")).toHaveValue("flake came off");

  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Open" }));
  expect(await screen.findByLabelText("What happened")).toHaveValue("");
});
