import type { Preview } from "@storybook/react-vite";
import { useLayoutEffect } from "react";
import { MemoryRouter } from "react-router";

import "@/app/globals.css";
import "./fonts.css";

const preview: Preview = {
  beforeEach: ({ canvasElement }) => {
    delete canvasElement.dataset.storyReady;
  },
  afterEach: ({ canvasElement }) => {
    // Browser audits wait for play functions as well as the initial render.
    canvasElement.dataset.storyReady = "true";
  },
  initialGlobals: { theme: "light" },
  globalTypes: {
    theme: {
      description: "Betabook appearance",
      toolbar: {
        icon: "circlehollow",
        items: [
          { value: "light", title: "Paper (light)" },
          { value: "dark", title: "Ink (dark)" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    options: {
      storySort: {
        method: "alphabetical",
        order: ["Foundations", "Components", "Patterns", "Internal"],
      },
    },
    layout: "fullscreen",

    // Hosting only: local Playwright owns UI checks; Chromatic must not
    // capture snapshots even if remote testing settings are re-enabled.
    chromatic: { disableSnapshot: true },
  },
  decorators: [
    function AppTheme(Story, context) {
      const theme = context.globals.theme === "dark" ? "dark" : "light";
      useLayoutEffect(() => {
        const html = document.documentElement;
        html.classList.remove("light", "dark");
        html.classList.add(theme);
        html.dataset.theme = theme;
        html.lang = "en";
        return () => {
          html.classList.remove(theme);
          delete html.dataset.theme;
        };
      }, [theme]);
      const nav = context.parameters.router?.navigation;
      const search = new URLSearchParams(nav?.query ?? {}).toString();
      const href = (nav?.pathname ?? "/") + (search ? "?" + search : "");
      return (
        <MemoryRouter key={context.id} initialEntries={[href]}>
          <main className="min-h-screen bg-background p-4 font-sans text-foreground antialiased">
            <div className={context.parameters.fullWidth ? "w-full" : "mx-auto max-w-3xl"}>
              <Story />
            </div>
          </main>
        </MemoryRouter>
      );
    },
  ],
};

export default preview;
