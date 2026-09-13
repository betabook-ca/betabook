import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { OptionSelect } from "@/components/ui/option-select";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { SettingsRow, SettingsSection } from "./settings";

const meta = {
  title: "Components/Layout/Settings",
  component: SettingsSection,
} satisfies Meta<typeof SettingsSection>;
export default meta;
// These local-state examples supply their own component props.
type Story = StoryObj;

function Example() {
  const [theme, setTheme] = useState("system");
  return (
    <StoryPage
      title="Settings sections"
      description="One quiet panel per group, with hairlines between rows. Headings sit beside their panels on wide screens. On phones, controls stack under their text unless the row is inline. Each row gets one short line of help at most."
    >
      <SettingsSection id="story-preferences" title="Preferences">
        <SettingsRow title="Theme" description="On this device." inline>
          <OptionSelect
            ariaLabel="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ]}
            className="w-28"
          />
        </SettingsRow>
        <SettingsRow
          title="Getting started"
          description="Learn to log sessions, add friends and set privacy."
        >
          <Button variant="outline">Replay product tour</Button>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection id="story-delete" title="Delete account" tone="danger">
        <SettingsRow description="Permanently removes your account and climbing history. Export your sends first.">
          <Button variant="danger">Delete account</Button>
        </SettingsRow>
      </SettingsSection>
    </StoryPage>
  );
}

export const Sections: Story = { render: () => <Example /> };
