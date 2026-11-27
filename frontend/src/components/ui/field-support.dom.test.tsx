import { Label, TextArea, TextField } from "@heroui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";

import { FieldFeedback, FieldHeader } from "./field-support";

function Example() {
  const [value, setValue] = useState("");
  const error = value.length > 5 ? "Use at most 5 characters." : null;
  return (
    <TextField value={value} onChange={setValue} isInvalid={!!error}>
      <FieldHeader usage={{ used: value.length, limit: 5, unit: "characters" }}>
        <Label>Notes</Label>
      </FieldHeader>
      <TextArea />
      <FieldFeedback helper="Tell us how it went." error={error} />
    </TextField>
  );
}
it("keeps the count visible as an associated error replaces help and recovers", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const input = screen.getByRole("textbox", { name: "Notes" });
  expect(screen.getByText("0/5 characters")).toBeInTheDocument();
  expect(input).toHaveAccessibleDescription("Tell us how it went.");
  await user.type(input, "abcde");
  expect(screen.getByText("5/5 characters")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.type(input, "f");
  expect(screen.getByText("6/5 characters")).toBeInTheDocument();
  expect(input).toHaveAccessibleDescription("Use at most 5 characters.");
  expect(screen.queryByText("Tell us how it went.")).not.toBeInTheDocument();
  await user.keyboard("{Backspace}");
  expect(screen.getByText("5/5 characters")).toBeInTheDocument();
  expect(input).toHaveAccessibleDescription("Tell us how it went.");
});
