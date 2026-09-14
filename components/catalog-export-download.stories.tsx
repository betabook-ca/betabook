import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SettingsSection } from "@/components/ui/settings";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { CatalogExportDownload } from "./catalog-export-download";

const meta = {
  title: "Components/Account/Catalog export",
  component: CatalogExportDownload,
} satisfies Meta<typeof CatalogExportDownload>;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({ info }: React.ComponentProps<typeof CatalogExportDownload>) {
  return (
    <StoryPage
      title="Catalog"
      description="The /account row for the weekly areas-and-climbs snapshot. The link is a plain download anchor, not a client navigation."
    >
      <SettingsSection id="catalog" title="Catalog">
        <CatalogExportDownload info={info} />
      </SettingsSection>
    </StoryPage>
  );
}

export const Available: Story = {
  args: {
    info: {
      generatedAt: "2026-09-14T06:00:00.000Z",
      areaCount: 412,
      climbCount: 5083,
      size: 1_204_000,
    },
  },
  render: (args) => <Example {...args} />,
};

export const Missing: Story = {
  args: { info: null },
  render: (args) => <Example {...args} />,
};
