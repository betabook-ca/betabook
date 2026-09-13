import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { DateFilterValue } from "@/lib/filters/date-filter";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
import { DEFAULT_USER_SENDS_FILTER } from "@/lib/filters/user-sends-filter";

import { AnalyticsHashtagFilter } from "./analytics-hashtag-filter";
import { JournalFilterToolbar } from "./journal-filter-toolbar";
import { UserSendsFilterToolbar } from "./sends-filter-toolbar";

const { replace } = vi.hoisted(() => ({ replace: vi.fn<(href: string) => void>() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn<(href: string) => void>() }),
  usePathname: () => "/users/sample/analytics",
  useSearchParams: () => new URLSearchParams("discipline=boulder"),
}));

it("Sends exposes selected discipline ranges and independent ascent tags, then clears globally", async () => {
  const user = userEvent.setup();
  render(
    <UserSendsFilterToolbar filter={DEFAULT_USER_SENDS_FILTER} basePath="/users/sample/sends" />,
  );
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  for (const name of ["Boulder", "Sport", "Trad"]) {
    await user.click(screen.getByRole("button", { name }));
    expect(
      within(screen.getByRole("group", { name: `${name} range` })).getByRole("button", {
        name: /Min grade$/,
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name }));
    expect(screen.queryByRole("group", { name: `${name} range` })).not.toBeInTheDocument();
  }
  const flash = screen.getByRole("button", { name: "Flash" });
  const onsight = screen.getByRole("button", { name: "Onsight" });
  await user.click(flash);
  await user.click(onsight);
  await user.click(flash);
  expect(flash).toHaveAttribute("aria-pressed", "false");
  expect(onsight).toHaveAttribute("aria-pressed", "true");
  await user.click(
    within(screen.getByRole("radiogroup", { name: "Min rating" })).getByRole("radio", {
      name: "3 stars",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Hide filters" }));
  expect(screen.getByRole("button", { name: "Remove Rating: 3–5 stars" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.queryByRole("region", { name: "Active filters" })).not.toBeInTheDocument();
});
it("Journal retains Tags and dates in its collapsed summary and clears both", async () => {
  const user = userEvent.setup();
  render(
    <JournalFilterToolbar
      userId="sample"
      filter={DEFAULT_JOURNAL_FILTER}
      climbName={null}
      tags={["power"]}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  await user.type(screen.getByRole("combobox", { name: "Tags" }), "power{Enter}");
  await user.click(screen.getByRole("button", { name: /Dates$/ }));
  await user.click(await screen.findByRole("option", { name: "This year" }));
  await user.click(screen.getByRole("button", { name: "Hide filters" }));
  expect(screen.getByRole("button", { name: "Remove #power" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove Dates: This year" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.queryByRole("region", { name: "Active filters" })).not.toBeInTheDocument();
});
it("Analytics keeps selected Tags clearable outside its collapsed disclosure", async () => {
  const user = userEvent.setup();
  render(<AnalyticsHashtagFilter selectedTags={["trip"]} tags={["trip"]} />);
  expect(screen.queryByRole("combobox", { name: "Tags" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove #trip" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  expect(screen.getByRole("combobox", { name: "Tags" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Hide filters" }));
  await user.click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.queryByRole("region", { name: "Active filters" })).not.toBeInTheDocument();
});

// Both toolbars render their date selection twice: as a removable chip in the
// collapsed summary and as the control inside the disclosure. Removing the
// chip has to reset the control too, or a reopened panel still reads "Custom
// dates" over a filter that is no longer applied.
const DATE_CASES = [
  { name: "a single day", dates: { date: "2025-06-01" }, label: "Dates: Jun 1, 2025" },
  {
    name: "a date range",
    dates: { dateFrom: "2025-06-01", dateTo: "2025-08-31" },
    label: "Dates: Jun 1, 2025 \u2013 Aug 31, 2025",
  },
];

const TOOLBARS = [
  {
    name: "Journal",
    render: (dates: DateFilterValue) => (
      <JournalFilterToolbar
        userId="sample"
        filter={{ ...DEFAULT_JOURNAL_FILTER, ...dates }}
        climbName={null}
        tags={["power"]}
      />
    ),
  },
  {
    name: "Sends",
    render: (dates: DateFilterValue) => (
      <UserSendsFilterToolbar
        filter={{ ...DEFAULT_USER_SENDS_FILTER, ...dates }}
        basePath="/users/sample/sends"
      />
    ),
  },
];

for (const toolbar of TOOLBARS) {
  for (const { name, dates, label } of DATE_CASES) {
    it(`${toolbar.name} keeps ${name} across the disclosure and resets Dates when the chip goes`, async () => {
      const user = userEvent.setup();
      render(toolbar.render(dates));
      const chip = () => screen.queryByRole("button", { name: `Remove ${label}` });
      expect(chip()).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Expand filters" }));
      expect(screen.getByRole("button", { name: "Custom dates Dates" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Hide filters" }));
      expect(chip()).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: `Remove ${label}` }));
      expect(chip()).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Expand filters" }));
      expect(screen.getByRole("button", { name: "All time Dates" })).toBeInTheDocument();
    });
  }
}
