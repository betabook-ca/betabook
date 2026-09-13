"use client";

import { Button } from "@heroui/react";
import { X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { OverlayArrow, Popover, type PopoverProps } from "react-aria-components";

import { NewTag } from "./new-tag";

export interface FeatureCalloutProps {
  children: ReactNode;
  title: string;
  description: string;
  isOpen: boolean;
  onDismiss: () => void;
  isPending?: boolean;
  error?: string | null;
  placement?: PopoverProps["placement"];
}

/** Nonmodal: leaves the target usable and never closes on outside clicks or Escape. */
export function FeatureCallout({
  children,
  title,
  description,
  isOpen,
  onDismiss,
  isPending = false,
  error,
  placement = "bottom start",
}: FeatureCalloutProps) {
  const anchor = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  return (
    <>
      <div ref={anchor} className="inline-flex max-w-full">
        {children}
      </div>
      <Popover
        triggerRef={anchor}
        isOpen={isOpen}
        isNonModal
        isKeyboardDismissDisabled
        shouldCloseOnInteractOutside={() => false}
        placement={placement}
        offset={12}
        containerPadding={12}
        className="z-50 w-96 max-w-[calc(100%-24px)] rounded-2xl bg-accent p-4 text-accent-foreground shadow-lg outline-none"
      >
        <OverlayArrow className="group">
          <svg
            width="16"
            height="8"
            viewBox="0 0 16 8"
            className="block fill-accent group-data-[placement=left]:-rotate-90 group-data-[placement=right]:rotate-90 group-data-[placement=top]:rotate-180"
            aria-hidden="true"
          >
            <path d="M0 8 L8 0 L16 8Z" />
          </svg>
        </OverlayArrow>
        <section aria-labelledby={titleId} aria-describedby={descriptionId}>
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pt-2">
              <h2 id={titleId} className="text-base leading-snug font-semibold break-words">
                {title}
              </h2>
              <NewTag />
            </div>
            <Button
              isIconOnly
              variant="ghost"
              aria-label={`Dismiss announcement: ${title}`}
              isDisabled={isPending}
              onPress={onDismiss}
              className="size-11 min-w-11 shrink-0 text-accent-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <p id={descriptionId} className="mt-2 text-sm leading-relaxed break-words">
            {description}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium">
              {error} Try dismissing again.
            </p>
          )}
        </section>
      </Popover>
    </>
  );
}
