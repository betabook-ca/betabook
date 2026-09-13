"use client";

import { clsx } from "clsx";
import { Newspaper, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { FriendRequestBadge, withRequestCount } from "@/components/friend-request-badge";
import { useFriendRequestCount } from "@/components/friend-requests-provider";
import { NavLink, navCurrent } from "@/components/nav-link";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useClientSession } from "@/hooks/use-client-session";

export type TabAccount = { id: string; name: string; image?: string | null };

const INPUT_TYPES_WITHOUT_KEYBOARD = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function opensKeyboard(target: EventTarget | null) {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !INPUT_TYPES_WITHOUT_KEYBOARD.has(target.type);
  return target instanceof HTMLElement && target.isContentEditable;
}

/** The on-screen keyboard resizes the page up to the bar, which would cover the field. */
function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => setTyping(opensKeyboard(event.target));
    const onFocusOut = (event: FocusEvent) => setTyping(opensKeyboard(event.relatedTarget));
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  return typing;
}

export function AppTabBar() {
  const session = useClientSession();
  const requestCount = useFriendRequestCount();
  const pathname = usePathname();
  const typing = useTyping();
  if (!session) return null;

  return (
    <>
      <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-bottom))] md:hidden" />
      {!typing && !pathname.startsWith("/tutorial/") && (
        <nav
          aria-label="Primary"
          data-app-tab-bar
          className="fixed inset-x-0 bottom-0 z-40 border-t border-separator bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <AppTabs account={session.user} requestCount={requestCount} />
        </nav>
      )}
    </>
  );
}

export function AppTabs({
  account,
  requestCount = 0,
}: {
  account: TabAccount;
  requestCount?: number;
}) {
  const profile = `/users/${account.id}`;
  const profileCurrent = navCurrent(usePathname(), profile, { matchWithin: true });

  return (
    <ul className="mx-auto grid h-14 max-w-md grid-cols-3">
      <li>
        <NavLink appearance="tab" href={profile} matchWithin>
          <UserAvatar
            name={account.name}
            image={account.image}
            size="xs"
            className={clsx(
              profileCurrent && "ring-2 ring-link ring-offset-1 ring-offset-background",
            )}
          />
          Profile
        </NavLink>
      </li>
      <li>
        <NavLink appearance="tab" href="/feed">
          <Newspaper aria-hidden className="size-6" />
          Feed
        </NavLink>
      </li>
      <li>
        <NavLink
          appearance="tab"
          href="/friends"
          aria-label={requestCount > 0 ? withRequestCount("Friends", requestCount) : undefined}
        >
          <span className="relative">
            <Users aria-hidden className="size-6" />
            <FriendRequestBadge
              decorative
              count={requestCount}
              className="absolute -top-1.5 left-3.5"
            />
          </span>
          Friends
        </NavLink>
      </li>
    </ul>
  );
}
