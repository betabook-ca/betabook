import { defineConfig } from "@playwright/test";

import { appBaseURL, appPort } from "@/tests/ui/app-server";

// oxlint-disable-next-line node/no-process-env
const ci = Boolean(process.env.CI);

// `app` runs only the @app tests and starts only `next dev`; `gallery` runs the
// rest against the built gallery alone. Unset runs everything.
// oxlint-disable-next-line node/no-process-env
const suite = process.env.BETABOOK_UI_SUITE || undefined;
if (suite !== undefined && suite !== "app" && suite !== "gallery") {
  throw new Error('BETABOOK_UI_SUITE must be "app" or "gallery"');
}

export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  grep: suite === "app" ? /@app\b/ : suite === "gallery" ? /^(?!.*@app\b)/ : undefined,
  // Measured on four-vCPU runners. Sharing one with `next dev`, more than two
  // workers starve the dev server until the app tests miss their navigation
  // timeouts. The gallery alone runs 1.2x faster at four workers than at two,
  // and at six a story load misses its timeout. Locally there are cores to
  // spare, so take half the machine.
  workers: !ci ? "50%" : suite === "gallery" ? 4 : 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:6007",
    browserName: "chromium",
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    contextOptions: { reducedMotion: "reduce" },
    // Recording a trace costs every test, including the passing ones whose
    // trace is discarded. CI keeps it because a failed job cannot be re-run
    // locally against the same tree; locally, rerun the case with --trace on.
    trace: ci ? "retain-on-failure" : "off",
    screenshot: "only-on-failure",
  },
  // Each project is a viewport/theme pair, and an untagged test runs in all
  // four. A tag states what the test's assertions cannot depend on:
  //   @layout   geometry that no theme can change. Runs the desktop-light /
  //             mobile-dark diagonal, so both viewports are still measured and
  //             review still gets one light and one dark screenshot.
  //   @behavior independent of viewport and theme both. Runs once, desktop-light.
  // Needing fewer runs is not a reason to tag: the assertions must be unable to
  // vary. Anything that reads a color, or that renders differently per theme,
  // stays untagged. @app is separate: it marks a test that loads the real app,
  // which decides the server it needs, not the projects it runs in.
  projects: [
    {
      name: "desktop-light",
      use: { viewport: { width: 1024, height: 900 }, colorScheme: "light" },
    },
    {
      name: "desktop-dark",
      testIgnore: "**/artifacts.spec.ts",
      grepInvert: /@behavior|@layout/,
      use: { viewport: { width: 1024, height: 900 }, colorScheme: "dark" },
    },
    {
      name: "mobile-light",
      testIgnore: "**/artifacts.spec.ts",
      grepInvert: /@behavior|@layout/,
      use: { viewport: { width: 375, height: 812 }, colorScheme: "light", hasTouch: true },
    },
    {
      name: "mobile-dark",
      testIgnore: "**/artifacts.spec.ts",
      grepInvert: /@behavior/,
      use: { viewport: { width: 375, height: 812 }, colorScheme: "dark", hasTouch: true },
    },
  ],
  webServer: [
    ...(suite === "app"
      ? []
      : [
          {
            command:
              "pnpm exec vite preview --outDir storybook-static --host 127.0.0.1 --port 6007 --strictPort",
            url: "http://127.0.0.1:6007/index.json",
            reuseExistingServer: false,
          },
        ]),
    ...(suite === "gallery"
      ? []
      : [
          {
            command: `pnpm db:migrate:local && pnpm dev --port ${appPort}`,
            // Warm the homepage's cold compilation before measuring home-link navigation.
            url: appBaseURL,
            reuseExistingServer: true,
          },
        ]),
  ],
});
