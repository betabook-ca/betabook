import { expect, request } from "@playwright/test";

import { appBaseURL } from "./app-server";

export default async function warmAppSession() {
  // webServer waits for the homepage before this setup runs. The client-only
  // session request is a separate route; confirm it answers signed out before
  // timing UI assertions.
  const context = await request.newContext();
  try {
    const response = await context.get(`${appBaseURL}/api/auth/get-session`);
    await expect(response).toBeOK();
    expect(await response.json()).toBeNull();
  } finally {
    await context.dispose();
  }
}
