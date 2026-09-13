import { TextField, TextArea, Label } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { FilterInput } from "@/components/filters/filter-input";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { IndexRangeSelect } from "@/components/ui/index-select";
import { OptionSelect } from "@/components/ui/option-select";
import { StoryPage } from "@/stories/fixtures/story-layout";

const meta = { title: "Patterns/Fields/Standard widths", component: FilterInput } satisfies Meta<
  typeof FilterInput
>;
export default meta;
type Story = StoryObj;
function Widths({ size }: { size?: keyof typeof FIELD_WIDTH_CLASS }) {
  const [query, setQuery] = useState("");
  const [grades, setGrades] = useState<[number, number]>([0, 3]);
  const [sort, setSort] = useState("all");
  return (
    <StoryPage
      title="Standard field widths"
      description="Short: 7rem for grades, Min ascents and sorting. Medium: 11rem for dates, Tags and other choices. Long: 24rem for search, text filters and areas. Each shrinks to fit its container. Multiline notes fill the form width."
    >
      {(!size || size === "short") && (
        <section aria-label="Short field">
          <IndexRangeSelect
            label="Grades"
            minLabel="Min grade"
            maxLabel="Max grade"
            minOptions={["V0", "V1", "V2", "V3"]}
            maxOptions={["V0", "V1", "V2", "V3"]}
            range={grades}
            onChange={setGrades}
          />
        </section>
      )}
      {(!size || size === "medium") && (
        <section aria-label="Medium field">
          <OptionSelect
            ariaLabel="Dates"
            value={sort}
            onChange={setSort}
            options={[
              { value: "all", label: "All time" },
              { value: "year", label: "This year" },
            ]}
            className={FIELD_WIDTH_CLASS.medium}
          />
        </section>
      )}
      {(!size || size === "long") && (
        <section aria-label="Long field">
          <FilterInput
            label="Filter sends"
            placeholder="Filter sends…"
            value={query}
            onChange={setQuery}
          />
        </section>
      )}
    </StoryPage>
  );
}
export const Comparison: Story = { render: () => <Widths /> };
export const Short: Story = { render: () => <Widths size="short" /> };
export const Medium: Story = { render: () => <Widths size="medium" /> };
export const Long: Story = { render: () => <Widths size="long" /> };

export const FullWidthNotes: Story = {
  render: () => (
    <StoryPage
      title="Full-width notes"
      description="Multiline writing fields use the available form width, rather than another fixed size."
    >
      <TextField className="w-full min-w-0">
        <Label>How’d it go?</Label>
        <TextArea placeholder="Conditions, beta, how it felt…" />
      </TextField>
    </StoryPage>
  ),
};
