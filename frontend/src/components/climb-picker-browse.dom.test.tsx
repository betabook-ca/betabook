import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { ClimbPicker } from "@/components/climb-picker";
import type { ClimbWithAreaName } from "@/db/queries";
import { createSearchFixtureFetcher, searchAreaFetcher } from "@/stories/fixtures/app-search-demo";

function renderPicker(browseArea: boolean) {
  const onPick = vi.fn<(climb: ClimbWithAreaName) => void>();
  render(
    <ClimbPicker
      allowSentClimbs
      showAreaLookup
      browseArea={browseArea}
      fetcher={createSearchFixtureFetcher()}
      areaFetcher={searchAreaFetcher}
      onPick={onPick}
    />,
  );
  return onPick;
}

async function chooseArea(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("combobox", { name: "In area" }), "cedar");
  await user.click(await screen.findByRole("option", { name: /California \/ North Woods/ }));
}

it("lists a chosen area's climbs without a name when browsing, for picking several", async () => {
  const user = userEvent.setup();
  const onPick = renderPicker(true);
  expect(screen.queryByRole("region", { name: "Climbs results" })).not.toBeInTheDocument();

  await chooseArea(user);
  const results = await screen.findByRole("region", { name: "Climbs results" });
  const choices = await within(results).findAllByRole("button", { name: /Choose .*Cedar Grove/ });
  expect(choices.length).toBeGreaterThan(1);

  await user.click(choices[0]);
  await user.click(within(results).getAllByRole("button", { name: /Choose .*Cedar Grove/ })[1]);
  expect(onPick).toHaveBeenCalledTimes(2);
});

it("keeps other pickers a lookup by name: an area alone lists nothing", async () => {
  const user = userEvent.setup();
  renderPicker(false);
  await chooseArea(user);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Clear area Cedar Grove" })).toBeInTheDocument(),
  );
  expect(screen.queryByRole("region", { name: "Climbs results" })).not.toBeInTheDocument();
});
