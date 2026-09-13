import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { ImportSourceStep } from "./import-source-step";

it("shows one source at a time and links the KAYA style note directly to CSV", async () => {
  const onLoaded = vi.fn<() => void>();
  const onFile = vi.fn<(file: File) => void>();
  const { container } = render(<ImportSourceStep onLoaded={onLoaded} onFile={onFile} />);
  expect(screen.getByRole("button", { name: "Sendage" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "KAYA" }));
  expect(screen.getByRole("button", { name: "KAYA" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("textbox", { name: "KAYA username or profile link" })).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "Sendage username or profile link" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Use CSV" }));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "CSV file" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Choose a CSV file" })).toBeVisible();
  // The hidden native input is driven by the visible dropzone; user-event's
  // upload models the file chooser, which cannot be opened inside jsdom.
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File(["climb,style\nTest,flash"], "sends.csv", { type: "text/csv" });
  await userEvent.upload(input, file);
  expect(onFile).toHaveBeenCalledExactlyOnceWith(file);
  expect(onLoaded).not.toHaveBeenCalled();
});

it("locks source selection and CSV interaction while a file is being read", () => {
  render(<ImportSourceStep initialSource="csv" reading onLoaded={() => {}} onFile={() => {}} />);
  for (const source of ["Sendage", "KAYA", "CSV file"])
    expect(screen.getByRole("button", { name: source })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Choose a CSV file" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.getByText("Reading file…")).toBeVisible();
});
