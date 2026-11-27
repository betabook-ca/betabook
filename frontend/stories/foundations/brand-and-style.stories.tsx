import type { Meta, StoryObj } from "@storybook/react-vite";

import darkLogo from "@/assets/branding/betabook-lockup-dark.png?url";
import lightLogo from "@/assets/branding/betabook-lockup-light.png?url";
import { PageTitle, SectionHeading } from "@/components/ui/typography";

import { BrandIconReference } from "./brand-icon-reference";

const designPrinciples =
  "Betabook should feel like a calm, practical climbing logbook. Its identity comes from the warm paper, charcoal ink, clay accents, serif headings and bold DM Sans climb names, aligned dates and grades, and readable session notes. Reuse existing components and patterns before adding a new visual treatment. Explore Foundations / Tokens for live theme roles and measurements.";

const meta = {
  title: "Foundations/Brand and style",
  component: PageTitle,
  parameters: { docs: { description: { component: designPrinciples } } },
} satisfies Meta<typeof PageTitle>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const Foundations: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <PageTitle>Betabook design reference</PageTitle>
      <p className="text-sm text-muted">{designPrinciples}</p>
      <section className="flex flex-col gap-3">
        <SectionHeading>Brand identity</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: "Paper treatment", theme: "light", image: lightLogo },
            { label: "Ink treatment", theme: "dark", image: darkLogo },
          ].map(({ label, theme, image }) => (
            <figure key={label} className="flex min-w-0 flex-col gap-2">
              <div data-theme={theme} data-testid={`logo-${theme}`} className="bg-background">
                <img
                  src={image}
                  alt="Betabook — Climb · Log · Progress. A mountain turning into a checkmark, with a sun."
                  width={1000}
                  height={640}
                  className="h-auto w-full"
                />
              </div>
              <figcaption className="text-sm text-muted">{label}</figcaption>
            </figure>
          ))}
        </div>
        <p className="text-sm text-muted">
          A mountain flows into a checkmark beneath a coral sun. Keep the lowercase betabook
          wordmark and CLIMB · LOG · PROGRESS tagline together in the full logo.
        </p>
      </section>
      <BrandIconReference />
    </div>
  ),
};
