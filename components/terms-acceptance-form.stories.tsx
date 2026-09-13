import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cardClass } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/typography";
import { TERMS_UPDATED_LABEL, TERMS_VERSION } from "@/lib/terms";

import { TermsAcceptanceForm } from "./terms-acceptance-form";

const meta = {
  title: "Components/Auth/Accept terms",
  component: TermsAcceptanceForm,
  decorators: [
    (Story) => (
      <>
        <div className="flex flex-col gap-4" aria-hidden inert>
          <PageTitle>Your journal</PageTitle>
          <div className={cardClass()}>
            <p className="text-muted">Climbing sessions and recent activity</p>
          </div>
        </div>
        <Story />
      </>
    ),
  ],
  args: {
    version: TERMS_VERSION,
    versionLabel: TERMS_UPDATED_LABEL,
    previousVersion: null,
    onSignOut: () => {},
    onAccept: async () => ({ ok: false, error: "Example only. Your account has not changed." }),
  },
} satisfies Meta<typeof TermsAcceptanceForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ExistingAccount: Story = {};
export const UpdatedTerms: Story = { args: { previousVersion: "2025-01-01" } };
