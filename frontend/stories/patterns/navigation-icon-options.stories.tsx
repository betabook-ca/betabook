import type { Meta, StoryObj } from "@storybook/react-vite";

import { AppTabs } from "@/components/app-tab-bar";
import { PrimaryNavigationIcon } from "@/components/primary-navigation-icon";
import { StoryPage } from "@/stories/fixtures/story-layout";

const destinations = [
  { area: "logbook", label: "Logbook" },
  { area: "progress", label: "Progress" },
  { area: "community", label: "Community" },
  { area: "search", label: "Find climbs" },
  { area: "add", label: "Add climb or area" },
  { area: "tutorials", label: "Tutorials" },
  { area: "account", label: "Settings" },
] as const;

function NavigationIconOptions() {
  return (
    <StoryPage
      title="Navigation icon states"
      description="Production icons in both themes. Selected destinations use filled shapes; Progress keeps the same arrow with a heavier stroke. The live tab examples below are interactive."
    >
      <div className="grid gap-6 xl:grid-cols-2">
        {(["light", "dark"] as const).map((theme) => (
          <section
            key={theme}
            data-theme={theme}
            className={`${theme} rounded-2xl border border-separator bg-background p-4 text-foreground`}
          >
            <h2 className="mb-4 text-lg font-semibold">
              {theme === "light" ? "Light" : "Dark"} mode
            </h2>
            <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-y-2 text-sm">
              <span>Destination</span>
              <span className="text-center">Unselected</span>
              <span className="text-center">Selected</span>
              {destinations.map((item) => (
                <div key={item.area} className="contents">
                  <span>{item.label}</span>
                  <span className="flex h-11 items-center justify-center text-muted">
                    <PrimaryNavigationIcon area={item.area} />
                  </span>
                  <span className="flex h-11 items-center justify-center rounded-lg bg-navigation-active text-link">
                    <PrimaryNavigationIcon area={item.area} active />
                  </span>
                </div>
              ))}
            </div>
            <h3 className="mt-6 mb-3 text-sm font-semibold">Live tab selection</h3>
            <nav
              aria-label={`${theme} primary navigation`}
              className="app-tab-bar-surface mx-auto w-full"
            >
              <AppTabs
                account={{ id: "sample", name: "Alex Morgan" }}
                notificationCounts={{ logbook: 2, progress: 5, community: 12 }}
              />
            </nav>
          </section>
        ))}
      </div>
    </StoryPage>
  );
}

const meta = {
  title: "Patterns/Navigation icon options",
  component: NavigationIconOptions,
  parameters: { fullWidth: true, router: { navigation: { pathname: "/users/sample/journal" } } },
} satisfies Meta<typeof NavigationIconOptions>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison: Story = {};
