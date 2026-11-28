import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { formatGrade } from "@/lib/grades";

import { GradePreferencesProvider, useGradePreferences } from "./grade-preferences";

function Labels() {
  const prefs = useGradePreferences();
  return (
    <p>
      {formatGrade("boulder", 5, prefs)} / {formatGrade("sport", 17, prefs)}
    </p>
  );
}

it("answers the native scales when no provider is mounted", () => {
  render(<Labels />);
  expect(screen.getByText("V4 / 5.11d")).toBeInTheDocument();
});

it("hands every descendant the viewer's chosen scales", () => {
  render(
    <GradePreferencesProvider value={{ boulder: "font", rope: "french" }}>
      <Labels />
    </GradePreferencesProvider>,
  );
  expect(screen.getByText("6B / 7a")).toBeInTheDocument();
});

it("applies a change of value on rerender", () => {
  const view = render(
    <GradePreferencesProvider value={{ boulder: "font", rope: "yds" }}>
      <Labels />
    </GradePreferencesProvider>,
  );
  expect(screen.getByText("6B / 5.11d")).toBeInTheDocument();
  view.rerender(
    <GradePreferencesProvider value={{ boulder: "hueco", rope: "french" }}>
      <Labels />
    </GradePreferencesProvider>,
  );
  expect(screen.getByText("V4 / 7a")).toBeInTheDocument();
});
