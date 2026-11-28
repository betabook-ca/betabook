import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  DISCIPLINE_CHIP_CLASSNAME,
  DISCIPLINE_LABELS,
} from "@/components/climbing/discipline-chip";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { choicePillClass } from "./choice-pill";
import { ChoicePills } from "./choice-pills";

const meta = {
  title: "Components/Inputs/Choice pills",
  component: ChoicePills,
} satisfies Meta<typeof ChoicePills>;
export default meta;
// These local-state examples supply their own component props.
type Story = StoryObj;

const DISCIPLINES = ["boulder", "sport", "trad"] as const;

function Examples() {
  const [disciplines, setDisciplines] = useState<string[]>(["boulder"]);
  const [metric, setMetric] = useState<string[]>(["sends"]);
  return (
    <StoryPage title="Choice pills">
      <Example title="Multiple: discipline filter">
        <ChoicePills
          label="Disciplines"
          selectionMode="multiple"
          value={disciplines}
          onChange={setDisciplines}
          options={DISCIPLINES.map((value) => ({ value, label: DISCIPLINE_LABELS[value] }))}
          pillClass={(selected, value) =>
            choicePillClass(
              selected,
              DISCIPLINE_CHIP_CLASSNAME[value as (typeof DISCIPLINES)[number]],
            )
          }
          className="flex gap-1.5"
        />
      </Example>
      <Example title="Single: chart metric">
        <ChoicePills
          label="Volume metric"
          selectionMode="single"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "sends", label: "Sends" },
            { value: "days", label: "Days out" },
          ]}
          pillClass={(selected) => choicePillClass(selected, "bg-accent text-accent-foreground")}
          className="flex gap-2"
        />
      </Example>
    </StoryPage>
  );
}

export const Default: Story = { render: () => <Examples /> };
