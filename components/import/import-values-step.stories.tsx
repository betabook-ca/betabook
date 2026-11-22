import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { cardClass } from "@/components/ui/card";
import {
  detectDateFormat,
  distinctValues,
  guessAscentStyleMapping,
  guessClimbTypeMapping,
  guessColumnMapping,
  guessGradeFeelMapping,
  guessRatingMapping,
  parseCsvText,
} from "@/lib/sends-import";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ImportValuesStep, type ValueSettings } from "./import-values-step";
import { WizardSteps } from "./wizard-steps";

const meta = {
  title: "Components/Import/Import values",
  component: ImportValuesStep,
  decorators: [
    (Story) => (
      <StoryPage title="Import sends">
        <div className={`flex flex-col gap-6 ${cardClass("fluid")}`}>
          <WizardSteps step="values" onJump={null} />
          <Story />
        </div>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ImportValuesStep>;
export default meta;
// The example owns the settings, so each picker and the date preview respond.
type Story = StoryObj;

function Example({ csv }: { csv: string }) {
  const parsed = parseCsvText(csv);
  const mapping = guessColumnMapping(parsed.headers);
  const values = (column: string | null) => distinctValues(parsed.rows, column);
  const [settings, setSettings] = useState<ValueSettings>(() => ({
    ascentStyleMapping: guessAscentStyleMapping(values(mapping.ascentStyle)),
    climbTypeMapping: guessClimbTypeMapping(values(mapping.climbType)),
    gradeFeelMapping: guessGradeFeelMapping(values(mapping.gradeFeel)),
    ratingMapping: guessRatingMapping(values(mapping.rating), "unknown"),
    dateFormat: detectDateFormat(values(mapping.date)),
    gradeScale: "native",
  }));
  const [dropPlaceholders, setDropPlaceholders] = useState(false);
  return (
    <ImportValuesStep
      rows={parsed.rows}
      source="unknown"
      columnMapping={mapping}
      values={settings}
      onChange={setSettings}
      dropPlaceholderDates={dropPlaceholders}
      onDropPlaceholderDatesChange={setDropPlaceholders}
      onBack={() => {}}
      onNext={() => {}}
    />
  );
}

export const AmbiguousDates: Story = {
  render: () => (
    <Example
      csv={[
        "Climb Name,Date Sent,Ascent Style,Climb Type,Grade,Rating",
        "Cedar Arete,05/06/2019,Flash,Boulder,V3,4",
        "Midnight Lightning,07/08/2019,Send,Boulder,V8,5",
        "The Nose,09/10/2019,Redpoint,Trad,5.14a,3",
      ].join("\n")}
    />
  ),
};

export const ExportTimestamps: Story = {
  render: () => (
    <Example
      csv={[
        "Climb Name,Date Sent,Ascent Style,Grade",
        ...Array.from(
          { length: 6 },
          (_, i) => `Climb ${i + 1},2025-09-03T12:00:00.000Z,redpoint,V${i}`,
        ),
        "Climb 7,2025-08-01,flash,V2",
      ].join("\n")}
    />
  ),
};
