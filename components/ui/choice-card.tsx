"use client";

import { Button, type ButtonProps } from "@heroui/react";
import { clsx } from "clsx";

type ChoiceCardProps = Omit<ButtonProps, "variant" | "size" | "className"> & {
  /** `lg` is the roomier card for a choice with an icon and a description
   * on one row, such as the goal categories. */
  size?: "md" | "lg";
  className?: string;
};

/** A full-width, multi-line outline button for picking one option of a
 * step — what kind of entry to log, which goal to set. Panel corners rather
 * than the pill a one-line button wears, and text that wraps. Pass
 * `aria-pressed` when the card stays on screen as a selection; the pressed
 * card keeps the hover fill. */
export function ChoiceCard({ size = "md", className, ...props }: ChoiceCardProps) {
  return (
    <Button
      variant="outline"
      className={clsx(
        "h-auto w-full min-w-0 justify-start rounded-panel text-left whitespace-normal aria-pressed:bg-(--button-bg-hover)",
        size === "lg" ? "gap-3 px-4 py-4" : "min-h-16 px-3 py-3",
        className,
      )}
      {...props}
    />
  );
}
