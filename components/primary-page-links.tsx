"use client";

import { Menu } from "@heroui/react";
import { ChevronDown, Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button, MenuTrigger, Popover } from "react-aria-components";

import { NavLink, navItemClass } from "@/components/nav-link";

const CREATE_PAGES = [
  { id: "climb", href: "/climbs/new", item: "Climb", row: "Add climb" },
  { id: "area", href: "/areas/new", item: "Area", row: "Add area" },
] as const;

/** The header folds both create pages into one Add menu; the side menu has room for both rows. */
export function PrimaryPageLinks({
  userId,
  direction = "row",
  onNavigate,
}: {
  userId: string;
  direction?: "row" | "col";
  onNavigate?: () => void;
}) {
  const layout = direction === "col" ? "menu" : "header";
  return (
    <>
      {direction === "col" ? (
        CREATE_PAGES.map((page) => (
          <NavLink
            key={page.id}
            appearance="primary"
            layout="menu"
            href={page.href}
            onClick={onNavigate}
          >
            {page.row}
          </NavLink>
        ))
      ) : (
        <AddMenu />
      )}
      <NavLink
        appearance="primary"
        layout={layout}
        href="/feed"
        relatedPaths={["/friends"]}
        onClick={onNavigate}
      >
        Feed
      </NavLink>
      <NavLink
        appearance="primary"
        layout={layout}
        href={`/users/${userId}`}
        matchWithin
        onClick={onNavigate}
      >
        My profile
      </NavLink>
    </>
  );
}

function AddMenu() {
  const pathname = usePathname();
  const active = CREATE_PAGES.some((page) => page.href === pathname);
  return (
    <MenuTrigger>
      <Button
        className={`${navItemClass("header", active)} cursor-pointer gap-1.5 outline-none data-[focus-visible]:status-focused`}
      >
        <Plus aria-hidden className="size-4" />
        Add
        <ChevronDown aria-hidden className="size-3.5" />
      </Button>
      <Popover className="popover" placement="bottom end">
        <Menu.Root aria-label="Add">
          {CREATE_PAGES.map((page) => (
            <Menu.Item key={page.id} id={page.id} href={page.href}>
              {page.item}
            </Menu.Item>
          ))}
        </Menu.Root>
      </Popover>
    </MenuTrigger>
  );
}
