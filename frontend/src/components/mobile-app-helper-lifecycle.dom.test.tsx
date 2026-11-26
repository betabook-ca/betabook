import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { isMobileHelperDismissed } from "@/lib/mobile-detection";
import { suspendMobileHelper } from "@/lib/mobile-helper-suspension";

import { MobileAppHelper, openMobileAppHelper } from "./mobile-app-helper";

afterEach(() => localStorage.clear());

async function openHelper() {
  await act(async () => {
    openMobileAppHelper();
    // The real deferred chunk can compile slowly during a full Workers run.
    // Await its import rather than racing Testing Library's polling deadline.
    await vi.dynamicImportSettled();
  });
}

it("retains the actual install event during a tour, uses it after resume, and cleans up on unmount", async () => {
  const user = userEvent.setup();
  const resume = suspendMobileHelper();
  const { unmount } = render(<MobileAppHelper />);
  const prompt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  try {
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(prompt).not.toHaveBeenCalled();
  } finally {
    act(resume);
  }
  await openHelper();
  await user.click(await screen.findByRole("button", { name: "Install and create shortcut" }));
  await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
  expect(isMobileHelperDismissed()).toBe(true);
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  unmount();
  const later = new Event("beforeinstallprompt", { cancelable: true });
  window.dispatchEvent(later);
  expect(later.defaultPrevented).toBe(false);
});
it.each(["Got it", "Dismiss shortcut helper"])(
  "dismisses through %s, persists the preference and can be reopened",
  async (label) => {
    const user = userEvent.setup();
    render(<MobileAppHelper />);
    await openHelper();
    await user.click(await screen.findByRole("button", { name: label }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(isMobileHelperDismissed()).toBe(true);
    await openHelper();
    expect(
      await screen.findByRole("complementary", { name: "Add Betabook to Home Screen" }),
    ).toBeInTheDocument();
  },
);
