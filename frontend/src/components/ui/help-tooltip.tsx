"use client";

import { Button, Tooltip } from "@heroui/react";
import { CircleHelp } from "lucide-react";
import { useState, type ReactNode } from "react";

export function HelpTooltip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip.Root delay={200} isOpen={open} onOpenChange={setOpen}>
      <Button
        type="button"
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={label}
        className="size-6 min-w-0 text-muted"
        onPress={() => setOpen(true)}
      >
        <CircleHelp aria-hidden="true" className="size-4" />
      </Button>
      <Tooltip.Content placement="bottom start" className="max-w-xs break-normal">
        {children}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}
