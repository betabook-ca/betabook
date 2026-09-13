import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { WizardSteps, type Step } from "./wizard-steps";

const meta = { title: "Components/Import/Wizard steps", component: WizardSteps } satisfies Meta<
  typeof WizardSteps
>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
function ImportExample() {
  const [step, setStep] = useState<Step>("match");
  return (
    <StoryPage
      title="Import steps"
      description="Completed steps can be revisited. The sample step controls do not start an import."
    >
      <WizardSteps step={step} onJump={step === "result" ? null : setStep} />
      <p role="status">Current step: {step}</p>
      <div className="flex gap-2">
        <Button onPress={() => setStep("review")}>Review sample</Button>
        <Button variant="outline" onPress={() => setStep("result")}>
          Complete sample
        </Button>
      </div>
      <Example title="Non-interactive progress">
        <WizardSteps step="values" onJump={null} />
      </Example>
    </StoryPage>
  );
}
export const ImportSteps: Story = { render: () => <ImportExample /> };
