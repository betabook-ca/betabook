import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { SendGradeCell } from "./send-grade-cell";

it("keeps the feel arrow inside the suggested grade's parentheses", () => {
  render(
    <SendGradeCell type="boulder" grade={11} suggestedGrade={10} gradeFeel="high" rating={4} />,
  );

  const arrow = screen.getByLabelText("Felt hard for the grade");
  expect(arrow.parentElement).toHaveTextContent(/^\(V9\)$/);
});

it("puts the arrow beside the grade when no differing suggestion is shown", () => {
  render(
    <SendGradeCell type="boulder" grade={11} suggestedGrade={11} gradeFeel="low" rating={null} />,
  );

  const arrow = screen.getByLabelText("Felt soft for the grade");
  expect(screen.queryByText(/\(/)).not.toBeInTheDocument();
  expect(arrow.parentElement).toHaveTextContent(/^V10/);
});
