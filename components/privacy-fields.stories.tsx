import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { SettingsSection } from "@/components/ui/settings";
import type { SendCommentAudience, SharingAudience } from "@/lib/privacy";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { PrivacyDetails, PrivacyFields } from "./privacy-fields";

const meta = {
  title: "Components/Account/Privacy fields",
  component: PrivacyFields,
} satisfies Meta<typeof PrivacyFields>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
function PrivacyExample({
  privateProfile = false,
  pending = false,
  error = false,
  commentary = "public",
  details = false,
}: {
  privateProfile?: boolean;
  pending?: boolean;
  error?: boolean;
  commentary?: SendCommentAudience;
  details?: boolean;
}) {
  const [isPrivate, setPrivate] = useState(privateProfile);
  const [journal, setJournal] = useState<SharingAudience>("friends");
  const [comment, setComment] = useState(commentary);
  return (
    <StoryPage
      title="Privacy controls"
      description="Local state only. Toggle the profile to inspect how saved audiences become unavailable."
    >
      <SettingsSection id="privacy" title="Privacy">
        <PrivacyFields
          isPrivate={isPrivate}
          journalVisibility={journal}
          sendCommentVisibility={comment}
          onProfileChange={setPrivate}
          onJournalChange={setJournal}
          onSendCommentChange={setComment}
          isPending={pending}
          profileError={error ? "Could not save your changes. Try again." : null}
          sendCommentError={error ? "Could not save commentary. Try again." : null}
          journalError={error ? "Could not save Journal and goals audience. Try again." : null}
        />
        <PrivacyDetails defaultExpanded={details} />
      </SettingsSection>
    </StoryPage>
  );
}
export const Privacy: Story = { render: () => <PrivacyExample /> };
export const EveryoneCommentary: Story = { render: () => <PrivacyExample commentary="everyone" /> };
export const PrivateProfile: Story = { render: () => <PrivacyExample privateProfile /> };
export const PrivacyPending: Story = { render: () => <PrivacyExample pending /> };
export const PrivacyError: Story = { render: () => <PrivacyExample error /> };
export const WhoCanSeeWhat: Story = { render: () => <PrivacyExample details /> };
