import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import type { AreaSelection } from "@/lib/area-selection";

import { AreaLookup } from "./area-lookup";

const areas = [
  { id: 1, name: "Cedar Grove", ancestorPath: "California / North Woods" },
  { id: 3, name: "Cedar Grove", ancestorPath: "Oregon / Coast Range" },
];
function Lookup({ change }: { change: (area: AreaSelection | null) => void }) {
  const [area, setArea] = useState<AreaSelection | null>(null);
  return (
    <AreaLookup
      label="Area"
      value={area}
      fetcher={async () => areas}
      onChange={(next) => {
        setArea(next);
        change(next);
      }}
    />
  );
}
it("binds duplicate names by selected identity and clears the identity when typing", async () => {
  const user = userEvent.setup();
  const change = vi.fn<(area: AreaSelection | null) => void>();
  render(<Lookup change={change} />);
  const input = screen.getByRole("combobox", { name: "Area" });
  await user.type(input, "cedar");
  await user.click(await screen.findByRole("option", { name: /Oregon \/ Coast Range/ }));
  expect(change).toHaveBeenCalledExactlyOnceWith({
    id: "3",
    name: "Cedar Grove",
    path: "Oregon / Coast Range",
  });
  expect(input).toHaveValue("Cedar Grove");
  await user.type(input, " upper");
  expect(change).toHaveBeenLastCalledWith(null);
  expect(input).toHaveValue("Cedar Grove upper");
});
it("restores the query when an external selection changes and clears it when reset", () => {
  const change = vi.fn<(area: AreaSelection | null) => void>();
  const { rerender } = render(
    <AreaLookup
      value={null}
      defaultQuery="Imported name"
      onChange={change}
      fetcher={async () => []}
    />,
  );
  const input = screen.getByRole("combobox");
  expect(input).toHaveValue("Imported name");
  rerender(
    <AreaLookup
      value={{ id: "1", name: "Cedar Grove", path: "California" }}
      onChange={change}
      fetcher={async () => []}
    />,
  );
  expect(input).toHaveValue("Cedar Grove");
  rerender(<AreaLookup value={null} onChange={change} fetcher={async () => []} />);
  expect(input).toHaveValue("");
  expect(change).not.toHaveBeenCalled();
});
