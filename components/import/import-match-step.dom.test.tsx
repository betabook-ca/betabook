import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import type { ClimbCandidate } from "@/db/queries";
import { matchRows, mergeCandidates, resolveRows, type ManualChoice } from "@/lib/import-matching";
import type { NormalizedImportRow } from "@/lib/sends-import";

import { ImportMatchStep } from "./import-match-step";

/** Two climbs share a name and nothing separates them, so the row is
 * ambiguous and asks for a pick. One of them is broken before the row's
 * date, so picking it can never import. */
const INTACT: ClimbCandidate = {
  id: 1,
  name: "The Wave",
  key: "the wave",
  type: "boulder",
  grade: 4,
  areaId: 10,
  areaName: "Happy Boulders",
  ancestors: [],
  sendCount: 12,
  brokenOn: null,
  total: 2,
};
const BROKEN: ClimbCandidate = {
  ...INTACT,
  id: 2,
  areaId: 20,
  areaName: "Grand Wall Boulders",
  sendCount: 5,
  brokenOn: "2026-03-05",
};

const ROW: NormalizedImportRow = {
  rowIndex: 0,
  climbName: "The Wave",
  areaName: null,
  areaHints: [],
  climbTypeHint: null,
  ascentStyle: "redpoint",
  dateSent: "2026-06-01",
  rating: null,
  comment: null,
  gradeText: null,
  blankGradeMeans: "posted-grade",
  postedGradeText: null,
  gradeFeel: "solid",
  raw: {},
};

const index = mergeCandidates(new Map(), [INTACT, BROKEN]);

/** The step as the wizard drives it: manual choices live above it, so a pick
 * re-runs resolveRows and the render reflects the real resolved state rather
 * than one assembled by hand. */
function Step() {
  const [manual, setManual] = useState<Map<number, ManualChoice>>(new Map());
  const resolved = resolveRows(
    [ROW],
    matchRows([ROW], index, {
      gradeScale: "native",
      preferredAreas: [],
    }),
    manual,
  );
  return (
    <ImportMatchStep
      resolved={resolved}
      lookup={{ phase: "done" }}
      onRetryLookup={vi.fn<() => void>()}
      preferredAreas={[]}
      onPreferredAreasChange={vi.fn<() => void>()}
      filter="all"
      onFilterChange={vi.fn<() => void>()}
      onChoose={(rowIndex, choice) =>
        setManual((prev) => {
          const next = new Map(prev);
          if (choice) next.set(rowIndex, choice);
          else next.delete(rowIndex);
          return next;
        })
      }
      onChooseMany={vi.fn<() => void>()}
    />
  );
}

it("replaces the pick prompt with one break explanation when a broken candidate is chosen", async () => {
  const user = userEvent.setup();
  render(<Step />);

  // Ambiguous to start: the prompt and both candidates are offered, and the
  // broken one is labelled before anyone clicks it.
  expect(screen.getByText(/2 climbs share this name/)).toBeVisible();
  expect(screen.getByText("Needs a pick")).toBeVisible();
  const brokenCandidate = screen.getByRole("button", { name: /Grand Wall Boulders/ });
  expect(brokenCandidate).toHaveTextContent("Broken");

  await user.click(brokenCandidate);

  // Terminal now. Exactly one explanation: the pick prompt, the candidate
  // list and the not-found copy must all be gone, which is the regression
  // that showed a candidate list and a break notice at the same time.
  expect(
    screen.getByText(/Climb broke on 2026-03-05; this ascent is dated on or after it/),
  ).toBeVisible();
  expect(screen.getByText("Can't import")).toBeVisible();
  expect(screen.queryByText(/share this name/)).not.toBeInTheDocument();
  expect(screen.queryByText("Needs a pick")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Happy Boulders/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Search under a different spelling/)).not.toBeInTheDocument();

  // Still recoverable: search for another climb, or skip the row outright.
  expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Skip row" })).toBeEnabled();
});

it("keeps a pre-break ascent as an ordinary pick with no break warning", async () => {
  const user = userEvent.setup();
  render(<Step />);
  await user.click(screen.getByRole("button", { name: /Happy Boulders/ }));

  expect(screen.getByText("Picked")).toBeVisible();
  expect(screen.queryByText(/Climb broke on/)).not.toBeInTheDocument();
  expect(screen.queryByText("Can't import")).not.toBeInTheDocument();
});
