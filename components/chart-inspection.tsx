"use client";
import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";

/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- Arrow keys inspect the data points in this named chart group. */
import { ChartDetailsDialog, ChartDetailsPreview } from "@/components/chart-climb-details";
import { CHART_PREVIEW_LIMIT, uniqueChartClimbs, type ChartDetailGroup } from "@/lib/chart-details";

/** Shared pointer, touch, and keyboard readout for chart data marks. */
export function ChartInspection({
  label,
  children,
  details,
}: {
  label: string;
  children: ReactNode;
  details?: Record<string, ChartDetailGroup>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const pressedDetail = useRef<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 8, y: 8 });
  const showPointer = (event: PointerEvent<HTMLDivElement>) => {
    const mark = (event.target as Element).closest("[data-chart-detail]");
    if (!mark) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setDetail(mark.getAttribute("data-chart-detail"));
    setPosition({
      x: Math.max(4, Math.min(event.clientX - bounds.left + 12, bounds.width - 224)),
      y: details
        ? event.clientY + 232 < window.innerHeight
          ? event.clientY - bounds.top + 12
          : Math.max(4 - bounds.top, event.clientY - bounds.top - 220)
        : Math.max(4, Math.min(event.clientY - bounds.top - 52, bounds.height - 48)),
    });
  };
  const index = useRef(-1);
  const openDetail = (key: string | null) => {
    if (key && uniqueChartClimbs(details?.[key]?.rows ?? []).length > CHART_PREVIEW_LIMIT)
      setOpened(key);
  };
  const openedGroup = opened ? details?.[opened] : undefined;
  const visibleGroup = detail ? details?.[detail] : undefined;
  useEffect(() => {
    if (!detail || openedGroup) return;
    const dismissOutside = (event: Event) => {
      if (!container.current?.contains(event.target as Node)) setDetail(null);
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [detail, openedGroup]);
  return (
    <div
      ref={container}
      role="group"
      aria-label={label}
      tabIndex={0}
      className="relative min-w-0 rounded-panel focus-visible:status-focused [&_[data-chart-detail]]:cursor-crosshair [&_[data-chart-detail]:hover]:brightness-125"
      onPointerMove={showPointer}
      onPointerOver={showPointer}
      onPointerDown={(event) => {
        showPointer(event);
        const target = event.target as Element;
        pressedDetail.current =
          target.closest("[data-chart-detail]")?.getAttribute("data-chart-detail") ??
          (target.closest('[role="tooltip"]') ? detail : null);
      }}
      onClick={(event) => {
        if (!event.currentTarget.contains(event.target as Node)) return;
        const mark = (event.target as Element).closest("[data-chart-detail]");
        const key = mark?.getAttribute("data-chart-detail") ?? pressedDetail.current;
        if (key) {
          setDetail(key);
          openDetail(key);
        }
        pressedDetail.current = null;
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") setDetail(null);
      }}
      onBlur={() => setDetail(null)}
      onKeyDown={(event) => {
        if (!event.currentTarget.contains(event.target as Node)) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetail(detail);
          return;
        }
        const marks = event.currentTarget.querySelectorAll("[data-chart-detail]");
        if (!marks.length) return;
        if (event.key === "Escape") {
          setDetail(null);
          return;
        }
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        index.current =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? marks.length - 1
              : Math.max(
                  0,
                  Math.min(marks.length - 1, index.current + (event.key === "ArrowLeft" ? -1 : 1)),
                );
        const mark = marks[index.current];
        setDetail(mark.getAttribute("data-chart-detail"));
        const bounds = event.currentTarget.getBoundingClientRect();
        const point = mark.getBoundingClientRect();
        setPosition({ x: Math.max(4, Math.min(point.x - bounds.x, bounds.width - 224)), y: 4 });
      }}
    >
      {children}
      <div
        className="absolute z-10 w-max max-w-[min(13rem,calc(100%-8px))] text-xs"
        style={{ left: position.x, top: position.y }}
        aria-live="polite"
      >
        {detail && !openedGroup && (
          <div
            role="tooltip"
            className="block rounded-panel border border-border bg-overlay p-3 break-words text-foreground shadow-lg"
          >
            {visibleGroup ? <ChartDetailsPreview group={visibleGroup} /> : detail}
          </div>
        )}
      </div>
      <ChartDetailsDialog group={openedGroup ?? null} onClose={() => setOpened(null)} />
    </div>
  );
}

/** Full-height nearest-category targets keep line charts inspectable without adding visible dots. */
export function ChartHitRegions({
  labels,
  endpointHalf = false,
  right = 16,
}: {
  labels: string[];
  endpointHalf?: boolean;
  right?: number;
}) {
  const columns =
    endpointHalf && labels.length > 1
      ? labels.map((_, i) => (i === 0 || i === labels.length - 1 ? "1fr" : "2fr")).join(" ")
      : `repeat(${labels.length}, minmax(0, 1fr))`;
  return (
    <div
      aria-hidden
      className="absolute top-4 bottom-[38px] left-8 grid"
      style={{ right, gridTemplateColumns: columns }}
    >
      {labels.map((label) => (
        <span key={label} data-chart-detail={label} />
      ))}
    </div>
  );
}
