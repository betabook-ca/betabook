"use client";

import { ListBox, Select, useTheme } from "@heroui/react";

import { Skeleton } from "@/components/ui/skeleton";
import { useMounted } from "@/hooks/use-mounted";
import { syncThemeColorMeta } from "@/lib/theme-color";

/** The three-option theme picker, on /account only. Its own file keeps `Select`
 * and `ListBox` out of the bundle every route loads. */
export function ThemeSelect() {
  // Theme is client-only, so gate on mount. useTheme reads localStorage in its
  // initializer, so the first mounted render already shows the stored value.
  const mounted = useMounted();
  const { theme, setTheme } = useTheme("system");

  if (!mounted) {
    // Same footprint as the trigger below (w-28, min-h-9, rounded-field) so
    // the settings row doesn't shift when the select mounts.
    return <Skeleton rounded="rounded-field" className="h-9 w-28" />;
  }

  return (
    <Select
      aria-label="Theme"
      selectedKey={theme}
      onSelectionChange={(key) => {
        setTheme(String(key));
        syncThemeColorMeta(String(key));
      }}
    >
      <Select.Trigger className="w-28">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id="light">Light</ListBox.Item>
          <ListBox.Item id="dark">Dark</ListBox.Item>
          <ListBox.Item id="system">System</ListBox.Item>
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
