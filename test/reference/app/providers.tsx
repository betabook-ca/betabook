"use client";

import { Toast, useTheme } from "@heroui/react";
import { useRouter } from "next/navigation";
import { RouterProvider } from "react-aria-components";

import { FriendRequestsProvider } from "@/components/friend-requests-provider";
import { useIsAtLeast } from "@/hooks/use-breakpoint";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const desktop = useIsAtLeast("md");
  // The theme-picker dropdown on the account page has its own `useTheme()`
  // call, but that hook is what actually applies the saved theme to <html> —
  // calling it here too keeps it mounted (and applied) on every page, not
  // just while the account page happens to be on screen.
  useTheme("system");
  return (
    <RouterProvider navigate={router.push}>
      <FriendRequestsProvider>{children}</FriendRequestsProvider>
      {/* Where `toast()` from @heroui/react shows, such as "Added to list":
       * top centre on phones, top right from `md` up. `top-16` puts it just
       * below the 56px sticky header rather than over Search and Log. */}
      <Toast.Provider placement={desktop ? "top end" : "top"} className="top-16" />
    </RouterProvider>
  );
}
