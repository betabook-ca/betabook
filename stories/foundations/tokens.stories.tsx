/// <reference types="vite/client" />
import { Button, Input, Label, TextField } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cardClass } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Grade } from "@/components/ui/grade";
import { SectionHeading } from "@/components/ui/typography";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { ColorPage, ColorGrid, LiveSample } from "./token-reference";

import themeSource from "@/app/globals.css?raw";

const meta = { title: "Foundations/Tokens", component: ColorPage } satisfies Meta;
export default meta;
// These composed examples render their own props rather than using meta args.
type Story = StoryObj;

// Discover the app's declarations, so new palette/domain tokens appear without
// maintaining a second set of values. HeroUI's inherited roles are listed below.
const appTokens = [
  ...new Set(
    [...themeSource.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:/g)].map(
      (match) => match[1],
    ),
  ),
];
const colorTokens = appTokens.filter(
  (name) => !/^--(font-|color-|radius-|field-border-width|search-icon)/.test(name),
);
const actionRoles = ["accent", "default", "success", "warning", "danger"];
const inheritedActions = actionRoles.flatMap((role) =>
  ["", "-foreground", "-hover", "-soft", "-soft-foreground", "-soft-hover"].map(
    (suffix) => `--${role}${suffix}`,
  ),
);

export const Palette: Story = {
  render: () => (
    <ColorPage
      title="Paper and ink palette"
      description="Five fixed brand anchors. Paper is the light canvas and ink is the dark canvas. Components normally use the semantic roles derived from these anchors. The approved coral logo sun remains an artwork color, not an application token."
      names={colorTokens.filter((name) => name.startsWith("--palette-"))}
    />
  ),
};
export const Surfaces: Story = {
  render: () => (
    <ColorPage
      title="Surfaces and elevation"
      description="Background is the canvas. Quiet panels use secondary, bordered content uses surface, and nested insets use tertiary. Only floating content adds a shadow to the overlay role. See Patterns / Layout and feedback / Surface treatments for recipes. Field-background is for inputs and segment for segmented controls. Navigation-active-background is the support-blue selection fill reserved for the header and side-menu page links."
      names={[
        "--background",
        "--surface",
        "--surface-secondary",
        "--surface-tertiary",
        "--overlay",
        "--field-background",
        "--segment",
        "--navigation-active-background",
      ]}
    />
  ),
};
export const TextAndBorders: Story = {
  render: () => (
    <ColorPage
      title="Text, boundaries and focus"
      description="Foreground is primary text, muted is supporting copy, link is navigation, and focus marks keyboard position. Border and separator are decorative boundaries; they are not text colors."
      names={[
        "--foreground",
        "--muted",
        "--link",
        "--focus",
        "--border",
        "--separator",
        "--field-border",
        "--segment-foreground",
      ]}
    />
  ),
};
export const ActionsAndStatus: Story = {
  render: () => (
    <StoryPage
      title="Actions and status"
      description="Accent means primary action; success, warning and danger convey status. Foreground tokens pair with their corresponding fill. Soft and hover variants are derived by HeroUI. Warning retains the library's amber."
    >
      <ColorGrid names={inheritedActions} />
      <Example title="Real button treatments">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button isDisabled>Disabled</Button>
        </div>
      </Example>
    </StoryPage>
  ),
};
export const Climbing: Story = {
  render: () => (
    <ColorPage
      title="Climbing color roles"
      description="Discipline and ascent labels have paired background/foreground roles. Color supplements their text labels. Onsight uses success; rating stars use warning. These colors should not be repurposed for arbitrary decoration."
      names={colorTokens.filter((name) => /^--(discipline-|ascent-)/.test(name))}
    />
  ),
};
export const Typography: Story = {
  render: () => (
    <StoryPage
      title="Typography"
      description="Barlow Condensed gives headings a guidebook voice. Geist handles reading, controls and grades. Shared primitives and text styles are measured in the browser. The page title above uses PageTitle."
    >
      <LiveSample name="Display family · Barlow Condensed" property="font-family">
        <p className="font-display text-3xl font-semibold">A day in the mountains</p>
      </LiveSample>
      <LiveSample name="SectionHeading" property="font-size">
        <SectionHeading>Recent sessions</SectionHeading>
      </LiveSample>
      <LiveSample name="Body · Geist" property="font-family">
        <p>Find a climb, record the moves, and return with fresh beta.</p>
      </LiveSample>
      <LiveSample name="Supporting copy" property="font-size">
        <p className="text-sm text-muted">Logged on September 1, 2026</p>
      </LiveSample>
      <LiveSample name="Eyebrow" property="letter-spacing">
        <Eyebrow>Personal best</Eyebrow>
      </LiveSample>
      <LiveSample name="Grade" property="font-family">
        <Grade size="md">5.11a · V4</Grade>
      </LiveSample>
    </StoryPage>
  ),
};
export const Geometry: Story = {
  render: () => (
    <StoryPage
      title="Shape, spacing and elevation"
      description="Measurements come from the actual primitives at this viewport. Cards group content without shadows; fields and overlays follow their own HeroUI roles. Fluid card padding changes at the small breakpoint."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {(["sm", "md", "fluid"] as const).map((size) => (
          <LiveSample key={size} name={`cardClass(${size}) · padding`} property="padding">
            <div className={cardClass(size)}>Panel content</div>
          </LiveSample>
        ))}
        <LiveSample name="Panel radius · --radius-panel" property="border-radius">
          <div className={cardClass()}>Shared panel</div>
        </LiveSample>
        <LiveSample name="Card elevation" property="box-shadow">
          <div className={cardClass()}>No raised shadow</div>
        </LiveSample>
        <LiveSample name="Button radius" property="border-radius">
          <Button>Log session</Button>
        </LiveSample>
        <LiveSample name="Field radius token" property="border-radius">
          <div
            className="h-12 bg-(--field-background)"
            style={{ borderRadius: "var(--field-radius)" }}
          />
        </LiveSample>
        <LiveSample name="Field border width token" property="border-top-width">
          <div
            className="h-12 bg-(--field-background)"
            style={{ border: "var(--field-border-width) solid var(--field-border)" }}
          />
        </LiveSample>
      </div>
      <TextField>
        <Label>Actual field</Label>
        <Input placeholder="Inspect the input alongside the tokens" />
      </TextField>
    </StoryPage>
  ),
};

export const Fields: Story = {
  render: () => (
    <ColorPage
      title="Field color roles"
      description="Inputs inherit background, foreground, placeholder, hover, focus, and border roles from HeroUI. Dark fields also use a visible border width; the geometry page shows its current value."
      names={[
        "--field-background",
        "--field-foreground",
        "--field-placeholder",
        "--field-hover",
        "--field-focus",
        "--field-border",
        "--field-border-hover",
        "--field-border-focus",
      ]}
    />
  ),
};
export const SpacingAndMotion: Story = {
  render: () => (
    <StoryPage
      title="Spacing and motion"
      description="Spacing follows the Tailwind scale. Motion examples respect the operating system’s reduced-motion preference."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {[1, 2, 3, 4, 6, 8].map((step) => (
          <LiveSample key={step} name={`Spacing ${step}`} property="width">
            <div className="h-4 bg-accent" style={{ width: `calc(var(--spacing) * ${step})` }} />
          </LiveSample>
        ))}
      </div>
      <Example title="Animation recipes">
        <dl className="flex flex-col gap-3">
          {[...themeSource.matchAll(/@utility (animate-[\w-]+)\s*\{([^}]+)\}/g)].map((match) => (
            <div key={match[1]}>
              <dt className="text-sm font-medium">{match[1]}</dt>
              <dd className="text-xs break-all text-muted">{match[2].trim()}</dd>
            </div>
          ))}
        </dl>
      </Example>
      <LiveSample name="Bar animation at current motion preference" property="animation-name">
        <div className="h-4 w-24 bg-accent motion-safe:animate-bar-grow" />
      </LiveSample>
    </StoryPage>
  ),
};

export const AllApplicationColors: Story = {
  render: () => (
    <ColorPage
      title="All application color declarations"
      description="An automatically discovered index of the app's color declarations, excluding duplicate Tailwind aliases. New app color names appear here even before they are assigned a documentation group above."
      names={colorTokens}
    />
  ),
};
