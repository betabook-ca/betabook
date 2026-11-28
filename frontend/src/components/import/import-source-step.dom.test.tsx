import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { ImportSourceStep } from "./import-source-step";

it("shows one source at a time and links the KAYA style note directly to CSV", async () => {
  const onLoaded = vi.fn<() => void>();
  const onFile = vi.fn<(file: File) => void>();
  const { container } = render(<ImportSourceStep onLoaded={onLoaded} onFile={onFile} />);
  expect(screen.getByRole("radio", { name: "Sendage" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  await userEvent.click(screen.getByRole("radio", { name: "KAYA" }));
  expect(screen.getByRole("radio", { name: "KAYA" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("textbox", { name: "KAYA username or profile link" })).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "Sendage username or profile link" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("radio", { name: "Mountain Project" }));
  expect(
    screen.getByRole("textbox", { name: "Mountain Project user ID or profile link" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "KAYA username or profile link" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("radio", { name: "KAYA" }));
  await userEvent.click(screen.getByRole("button", { name: "Use CSV" }));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "CSV file" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("button", { name: "Choose a CSV file" })).toBeVisible();
  // The hidden native input is driven by the visible drop zone; user-event's
  // upload models the file chooser, which cannot be opened inside jsdom.
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File(["climb,style\nTest,flash"], "sends.csv", { type: "text/csv" });
  await userEvent.upload(input, file);
  expect(onFile).toHaveBeenCalledExactlyOnceWith(file);
  expect(onLoaded).not.toHaveBeenCalled();
});

it("locks source selection and CSV interaction while a file is being read", () => {
  render(<ImportSourceStep initialSource="csv" reading onLoaded={() => {}} onFile={() => {}} />);
  for (const source of ["Sendage", "KAYA", "Mountain Project", "CSV file"])
    expect(screen.getByRole("radio", { name: source })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Choose a CSV file" })).toBeDisabled();
  expect(screen.getByText("Reading file…")).toBeVisible();
});

it("opens the file chooser from the keyboard", async () => {
  const { container } = render(
    <ImportSourceStep initialSource="csv" onLoaded={() => {}} onFile={() => {}} />,
  );
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const click = vi.spyOn(input, "click").mockImplementation(() => {});
  screen.getByRole("button", { name: "Choose a CSV file" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(click).toHaveBeenCalledOnce();
  await userEvent.keyboard(" ");
  expect(click).toHaveBeenCalledTimes(2);
});

// user-event has no drag and drop, and jsdom has no DataTransfer, so these
// events carry a minimal stand-in for the one a browser fills in.
function dragEvents(file: File) {
  const dataTransfer = {
    types: ["Files"],
    items: [{ kind: "file", type: file.type, getAsFile: () => file }],
    files: [file],
    effectAllowed: "all",
    dropEffect: "none",
    getData: () => "",
  };
  return { dataTransfer, clientX: 10, clientY: 10 };
}

it("takes a file dropped on the card, but not while a file is being read", async () => {
  const onFile = vi.fn<(file: File) => void>();
  const file = new File(["climb,style\nTest,flash"], "sends.csv", { type: "text/csv" });
  const { rerender } = render(
    <ImportSourceStep initialSource="csv" onLoaded={() => {}} onFile={onFile} />,
  );
  const zone = screen.getByRole("button", { name: "Choose a CSV file" }).parentElement!;
  fireEvent.dragEnter(zone, dragEvents(file));
  expect(zone).toHaveAttribute("data-drop-target", "true");
  fireEvent.dragOver(zone, dragEvents(file));
  fireEvent.drop(zone, dragEvents(file));
  await waitFor(() => expect(onFile).toHaveBeenCalledExactlyOnceWith(file));
  expect(zone).not.toHaveAttribute("data-drop-target");

  rerender(<ImportSourceStep initialSource="csv" reading onLoaded={() => {}} onFile={onFile} />);
  fireEvent.dragEnter(zone, dragEvents(file));
  fireEvent.drop(zone, dragEvents(file));
  await Promise.resolve();
  expect(zone).not.toHaveAttribute("data-drop-target");
  expect(onFile).toHaveBeenCalledOnce();
});
