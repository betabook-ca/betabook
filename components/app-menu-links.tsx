"use client";

import { Button } from "@heroui/react";
import {
  GraduationCap,
  Newspaper,
  Plus,
  Settings,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import { FriendRequestCount, withRequestCount } from "@/components/friend-request-badge";
import { NavLink } from "@/components/nav-link";
import { SignOutButton } from "@/components/sign-out-button";
import { AppLink } from "@/components/ui/app-link";
import { UserAvatar } from "@/components/ui/user-avatar";
import { productTourPath } from "@/lib/product-tour-navigation";

export type MenuAccount = { id: string; name: string; image?: string | null; isAdmin: boolean };

const ICON_CLASS = "size-5 shrink-0";
const MENU_BUTTON_CLASS =
  "h-auto w-full justify-start gap-3 rounded-lg px-3 py-2 text-sm font-normal text-muted hover:bg-default hover:text-foreground";

export function AppMenuLinks({
  account,
  requestCount = 0,
  canInstall = false,
  onNavigate,
  onInstall,
}: {
  account: MenuAccount | null;
  requestCount?: number;
  canInstall?: boolean;
  onNavigate?: () => void;
  onInstall?: () => void;
}) {
  const row = { appearance: "menu", onClick: onNavigate } as const;
  return (
    <div className="flex flex-col gap-3 text-sm">
      {account ? (
        <MenuGroup>
          <NavLink {...row} href={`/users/${account.id}`} matchWithin className="gap-3">
            <UserAvatar name={account.name} image={account.image} size="sm" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{account.name}</span>
              <span className="text-xs font-normal">View profile</span>
            </span>
          </NavLink>
          <NavLink {...row} href="/feed" className="gap-3">
            <Newspaper aria-hidden className={ICON_CLASS} />
            Feed
          </NavLink>
          <NavLink
            {...row}
            href="/friends"
            aria-label={requestCount > 0 ? withRequestCount("Friends", requestCount) : undefined}
            className="gap-3"
          >
            <Users aria-hidden className={ICON_CLASS} />
            Friends
            <FriendRequestCount count={requestCount} className="ms-auto" />
          </NavLink>
          <NavLink {...row} href="/climbs/new" relatedPaths={["/areas/new"]} className="gap-3">
            <Plus aria-hidden className={ICON_CLASS} />
            Add climb/area
          </NavLink>
        </MenuGroup>
      ) : (
        <MenuGroup>
          <NavLink {...row} href="/sign-in">
            Sign in
          </NavLink>
          <NavLink {...row} href="/sign-up">
            Sign up
          </NavLink>
        </MenuGroup>
      )}
      {(account || canInstall) && (
        <MenuGroup>
          {account && (
            <>
              <NavLink {...row} href="/account" className="gap-3">
                <Settings aria-hidden className={ICON_CLASS} />
                Account settings
              </NavLink>
              <NavLink {...row} href={productTourPath("journal")} className="gap-3">
                <GraduationCap aria-hidden className={ICON_CLASS} />
                Tutorials
              </NavLink>
              {account.isAdmin && (
                <NavLink {...row} href="/admin/requests" matchWithin className="gap-3">
                  <ShieldCheck aria-hidden className={ICON_CLASS} />
                  Moderation
                </NavLink>
              )}
            </>
          )}
          {canInstall && (
            <Button variant="ghost" className={MENU_BUTTON_CLASS} onPress={onInstall}>
              <Smartphone aria-hidden className={ICON_CLASS} />
              Add to Home Screen
            </Button>
          )}
        </MenuGroup>
      )}
      <MenuGroup>
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-1 text-muted">
          <AppLink href="/about" onClick={onNavigate}>
            About
          </AppLink>
          <AppLink href="/contact" onClick={onNavigate}>
            Contact
          </AppLink>
          <AppLink href="/terms" onClick={onNavigate}>
            Terms of Service
          </AppLink>
        </div>
        {account && <SignOutButton compact className={MENU_BUTTON_CLASS} />}
      </MenuGroup>
    </div>
  );
}

function MenuGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-separator pt-3 first:border-t-0 first:pt-0">
      {children}
    </div>
  );
}
