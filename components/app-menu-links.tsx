"use client";

import { Button } from "@heroui/react";
import { clsx } from "clsx";
import {
  type LucideIcon,
  GraduationCap,
  LogIn,
  MapPinPlus,
  UserPlus,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  MENU_ROW_CLASS,
  MENU_ROW_IDLE_CLASS,
  SIDEBAR_ROW_CLASS,
  NavLink,
} from "@/components/nav-link";
import { PrimaryNavigationLink } from "@/components/primary-navigation-link";
import { SignOutButton } from "@/components/sign-out-button";
import { ACCOUNT_DESTINATION, primaryAreaForPath, primaryDestinations } from "@/lib/app-navigation";
import { productTourPath } from "@/lib/product-tour-navigation";
import { SEARCH_PATH } from "@/lib/search";

export type MenuAccount = { id: string; name: string; image?: string | null; isAdmin: boolean };

function menuClasses(sidebar: boolean, collapsed: boolean) {
  return {
    appearance: sidebar ? ("sidebar" as const) : ("menu" as const),
    row: clsx("justify-start", sidebar ? "overflow-hidden" : "min-h-12"),
    label: clsx("min-w-0 truncate", collapsed && "opacity-0"),
    container: clsx("flex flex-col gap-4 text-sm", sidebar && "min-h-full"),
    button: clsx(
      "justify-start font-normal",
      sidebar ? SIDEBAR_ROW_CLASS : `h-auto min-h-12 ${MENU_ROW_CLASS}`,
      MENU_ROW_IDLE_CLASS,
    ),
  };
}

export function AppMenuLinks({
  account,
  requestCount = 0,
  canInstall = false,
  collapsed = false,
  surface = "popover",
  showPrimary = true,
  onNavigate,
  onInstall,
}: {
  account: MenuAccount | null;
  requestCount?: number;
  canInstall?: boolean;
  collapsed?: boolean;
  surface?: "sidebar" | "popover";
  showPrimary?: boolean;
  onNavigate?: () => void;
  onInstall?: () => void;
}) {
  const pathname = usePathname();
  const current = account ? primaryAreaForPath(pathname, account.id) : undefined;
  const sidebar = surface === "sidebar";
  const styles = menuClasses(sidebar, collapsed);
  const row = {
    appearance: styles.appearance,
    onClick: onNavigate,
    className: styles.row,
  } as const;
  const labelClass = styles.label;
  return (
    <div className={styles.container}>
      {account ? (
        <MenuGroup>
          {showPrimary &&
            primaryDestinations(account.id).map((item) => (
              <PrimaryNavigationLink
                key={item.id}
                item={item}
                account={account}
                current={current === item.id}
                appearance={styles.appearance}
                collapsed={collapsed}
                requestCount={requestCount}
                onNavigate={onNavigate}
              />
            ))}
          <NavLink {...row} href={SEARCH_PATH} matchWithin>
            <MenuIcon icon={Search} />
            <span className={labelClass}>Find climbs</span>
          </NavLink>
          <NavLink {...row} href="/climbs/new" relatedPaths={["/areas/new"]}>
            <MenuIcon icon={sidebar ? MapPinPlus : Plus} />
            <span className={labelClass}>Add climb or area</span>
          </NavLink>
        </MenuGroup>
      ) : (
        <MenuGroup>
          <NavLink {...row} href="/sign-in">
            <MenuIcon icon={LogIn} />
            <span className={labelClass}>Sign in</span>
          </NavLink>
          <NavLink {...row} href="/sign-up">
            <MenuIcon icon={UserPlus} />
            <span className={labelClass}>Sign up</span>
          </NavLink>
        </MenuGroup>
      )}
      {(account || canInstall) && (
        <MenuGroup bottom={sidebar}>
          {account && (
            <>
              <NavLink {...row} href={productTourPath("journal")}>
                <MenuIcon icon={GraduationCap} />
                <span className={labelClass}>Tutorials</span>
              </NavLink>
              {account.isAdmin && (
                <NavLink {...row} href="/admin/requests" matchWithin>
                  <MenuIcon icon={ShieldCheck} />
                  <span className={labelClass}>Moderation</span>
                </NavLink>
              )}
            </>
          )}
          {canInstall && (
            <Button variant="ghost" className={styles.button} onPress={onInstall}>
              <MenuIcon icon={Smartphone} />
              <span className={labelClass}>Add to Home Screen</span>
            </Button>
          )}
          {account && (
            <PrimaryNavigationLink
              item={ACCOUNT_DESTINATION}
              account={account}
              current={current === "account"}
              appearance={styles.appearance}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          )}
          {account && sidebar && (
            <SignOutButton compact iconOnly={collapsed} className={styles.button} />
          )}
        </MenuGroup>
      )}
    </div>
  );
}

function MenuIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center">
      <Icon aria-hidden className="size-5" />
    </span>
  );
}

function MenuGroup({ children, bottom = false }: { children: ReactNode; bottom?: boolean }) {
  return <div className={clsx("flex flex-col gap-1", bottom && "mt-auto")}>{children}</div>;
}
