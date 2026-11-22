import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { cardClass } from "@/components/ui/card";
import {
  deriveSourceColumns,
  detectImportSource,
  guessColumnMapping,
  parseCsvText,
} from "@/lib/sends-import";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ImportColumnsStep } from "./import-columns-step";
import { WizardSteps } from "./wizard-steps";

const meta = {
  title: "Components/Import/Import columns",
  component: ImportColumnsStep,
  decorators: [
    (Story) => (
      <StoryPage title="Import sends">
        <div className={`flex flex-col gap-6 ${cardClass("fluid")}`}>
          <WizardSteps step="columns" onJump={null} />
          <Story />
        </div>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ImportColumnsStep>;
export default meta;
// The example owns the mapping, so pickers and location hints respond.
type Story = StoryObj;

function Example({ csv }: { csv: string }) {
  const parsed = parseCsvText(csv);
  const source = detectImportSource(parsed.headers);
  const withDerived = deriveSourceColumns(parsed, source);
  const [mapping, setMapping] = useState(() =>
    guessColumnMapping([...withDerived.headers, ...withDerived.derived]),
  );
  return (
    <ImportColumnsStep
      parsedCsv={withDerived}
      source={source}
      directSource={null}
      columnMapping={mapping}
      onChange={setMapping}
      onBack={() => {}}
      onNext={() => {}}
    />
  );
}

export const UnknownFile: Story = {
  render: () => (
    <Example
      csv={[
        "Name,When,How,Crag,Country,Notes",
        "Cedar Arete,2025-09-03,flash,Bishop,USA,Felt solid",
        "Midnight Lightning,2025-09-04,redpoint,Yosemite,USA,",
      ].join("\n")}
    />
  ),
};

export const MountainProjectFile: Story = {
  render: () => (
    <Example
      csv={[
        'Date,Route,Rating,Notes,URL,Pitches,Location,"Avg Stars","Your Stars",Style,"Lead Style","Route Type","Your Rating",Length,"Rating Code"',
        '2026-08-16,"Test climb",5.12a,"Fun",https://www.mountainproject.com/route/1/x,1,"Squamish > Wall",3.3,4,Lead,Redpoint,Sport,5.12a,60,3200',
      ].join("\n")}
    />
  ),
};
