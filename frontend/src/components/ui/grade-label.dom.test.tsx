import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { GradeLabel } from "./grade-label";
import { GradePreferencesProvider } from "./grade-preferences";

it("prints the catalog's scales without a provider and the '—' fallback for no grade", () => {
  render(
    <p>
      <GradeLabel type="boulder" grade={5} /> / <GradeLabel type="trad" grade={17} /> /{" "}
      <GradeLabel type="sport" grade={null} />
    </p>,
  );
  expect(screen.getByText("V4 / 5.11d / —")).toBeInTheDocument();
});

it("prints the viewer's chosen scales under the provider", () => {
  render(
    <GradePreferencesProvider value={{ boulder: "font", rope: "french" }}>
      <p>
        <GradeLabel type="boulder" grade={5} /> / <GradeLabel type="trad" grade={17} />
      </p>
    </GradePreferencesProvider>,
  );
  expect(screen.getByText("6B / 7a")).toBeInTheDocument();
});
