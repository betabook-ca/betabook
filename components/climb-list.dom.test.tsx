import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";

import type { ClimbWithAreaName } from "@/db/queries";

import { ClimbList } from "./climb-list";

const climbs: ClimbWithAreaName[] = [
  { id: 1, name: "Arete", type: "sport", grade: 20, areaId: 1, areaName: "Cedar", brokenOn: null },
  { id: 2, name: "Slab", type: "boulder", grade: 3, areaId: 1, areaName: "Cedar", brokenOn: null },
];

it("renders the climbs as a list of items, one link per row", () => {
  render(<ClimbList climbs={climbs} />);
  const list = screen.getByRole("list");
  const rows = within(list).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByRole("link", { name: "Arete" })).toBeInTheDocument();
  expect(within(rows[1]).getByRole("link", { name: "Slab" })).toBeInTheDocument();
});
