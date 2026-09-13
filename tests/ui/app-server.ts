// Share one port between the managed server and real-app tests. Match pnpm dev
// by default so a running app can be reused without competing for .next/dev.
// oxlint-disable-next-line node/no-process-env
export const appPort = Number(process.env.BETABOOK_UI_PORT ?? "3000");

if (!Number.isInteger(appPort) || appPort < 1 || appPort > 65535) {
  throw new Error("BETABOOK_UI_PORT must be a port between 1 and 65535");
}

// Tag tests that load this URL @app; gallery-only runs don't start the app.
export const appBaseURL = `http://localhost:${appPort}`;
