"use client";

import { Button } from "@heroui/react";
import { ArrowDown, ArrowUp, GripVertical, Plus, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  DropIndicator,
  GridList,
  GridListItem,
  useDragAndDrop,
  type DropIndicatorProps,
} from "react-aria-components";

import { FeatureAnnouncement } from "@/components/feature-announcement";
import { cardClass } from "@/components/ui/card";
import { EYEBROW_CLASS } from "@/components/ui/eyebrow";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SectionHeading } from "@/components/ui/typography";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import type { ActionResult } from "@/lib/action-result";
import {
  DEFAULT_ANALYTICS_LAYOUT,
  moveAnalyticsItem,
  parseAnalyticsLayout,
  type AnalyticsItemId,
  type AnalyticsLayout,
} from "@/lib/analytics-layout";
import { ANALYTICS_CUSTOMIZE_ANNOUNCEMENT } from "@/lib/feature-announcements";

export type AnalyticsPanel = {
  id: AnalyticsItemId;
  title: string;
  description?: string;
  content: ReactNode;
};
type Group = "cards" | "charts";

/** Anchor the insertion line to the destination card, without taking a grid cell. */
function InsertionMarker({
  target,
  gridRef,
  group,
  title,
}: {
  target: DropIndicatorProps["target"];
  gridRef: RefObject<HTMLDivElement | null>;
  group: Group;
  title: string;
}) {
  const [bounds, setBounds] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const marker = useRef<HTMLSpanElement>(null);
  useIsomorphicLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || target.type !== "item") return;
    const row = Array.from(grid.querySelectorAll<HTMLElement>("[data-key]")).find(
      (node) => node.dataset.key === String(target.key),
    );
    if (!row) return;
    const item = row.getBoundingClientRect();
    const container = grid.getBoundingClientRect();
    const after = target.dropPosition === "after";
    setBounds(
      group === "cards"
        ? {
            top: item.top - container.top,
            left: (after ? item.right : item.left) - container.left + (after ? 4 : -7),
            width: 3,
            height: item.height,
          }
        : {
            top: (after ? item.bottom : item.top) - container.top + (after ? 10 : -13),
            left: 0,
            width: item.width,
            height: 3,
          },
    );
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      marker.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
    }
  }, [target, gridRef, group]);
  return (
    <span
      ref={marker}
      style={bounds}
      className="pointer-events-none absolute z-10 rounded-full bg-accent"
    >
      <span
        className={`absolute top-0 w-max max-w-32 rounded-panel border border-accent bg-overlay px-2 py-1 text-xs text-foreground shadow-lg ${group === "charts" ? "left-2 -translate-y-full" : target.type === "item" && target.dropPosition === "after" ? "right-2" : "left-2"}`}
      >
        {target.type === "item" ? `Insert ${target.dropPosition} ${title}` : "Move here"}
      </span>
    </span>
  );
}

function DashboardGroup({
  group,
  items,
  editing,
  onMove,
  onHide,
  onCustomize,
}: {
  group: Group;
  items: AnalyticsPanel[];
  editing: boolean;
  onMove: (
    group: Group,
    source: AnalyticsItemId,
    target: AnalyticsItemId,
    position?: "before" | "after",
  ) => void;
  onHide: (id: AnalyticsItemId) => void;
  onCustomize?: () => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const orderKey = items.map((item) => item.id).join(",");
  const previousPositions = useRef(new Map<string, DOMRect>());
  useIsomorphicLayoutEffect(() => {
    const positions = new Map<string, DOMRect>();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const node of gridRef.current?.querySelectorAll<HTMLElement>("[data-key]") ?? []) {
      const key = node.dataset.key ?? "";
      const next = node.getBoundingClientRect();
      const previous = previousPositions.current.get(key);
      if (previous && !reducedMotion && (previous.x !== next.x || previous.y !== next.y)) {
        node.animate(
          [
            { transform: `translate(${previous.x - next.x}px, ${previous.y - next.y}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: 220, easing: "ease-out" },
        );
      }
      positions.set(key, next);
    }
    previousPositions.current = positions;
  }, [orderKey, editing]);
  const { dragAndDropHooks } = useDragAndDrop<AnalyticsPanel>({
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    renderDragPreview: (dragged) => (
      <div
        className={`flex items-center gap-3 border border-accent ${cardClass("sm", "floating")}`}
      >
        <GripVertical size={18} />
        <span className="text-sm font-medium">
          {items.find((item) => item.id === dragged[0]?.["text/plain"])?.title}
        </span>
      </div>
    ),
    renderDropIndicator: (target) => (
      <DropIndicator target={target} className="pointer-events-none absolute inset-0">
        {({ isDropTarget }) =>
          isDropTarget && (
            <InsertionMarker
              target={target}
              gridRef={gridRef}
              group={group}
              title={
                target.type === "item"
                  ? (items.find((item) => item.id === target.key)?.title ?? "card")
                  : ""
              }
            />
          )
        }
      </DropIndicator>
    ),
    onReorder: (event) => {
      const source = [...event.keys][0];
      onMove(
        group,
        String(source) as AnalyticsItemId,
        String(event.target.key) as AnalyticsItemId,
        event.target.dropPosition === "after" ? "after" : "before",
      );
    },
  });
  const grid =
    group === "cards"
      ? "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
      : "grid grid-cols-1 gap-6 lg:grid-cols-2";
  const chartSpan = (id: string) =>
    group === "charts" && !["pyramid", "breakthroughs", "flashRate"].includes(id)
      ? "lg:col-span-2"
      : "";
  const panel = (item: AnalyticsPanel, position: number) => (
    <article
      aria-label={item.title}
      className={`flex h-full min-w-0 flex-col gap-1 ${cardClass(group === "cards" ? "sm" : "fluid")}`}
    >
      {editing && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-1">
          <Button
            slot="drag"
            variant="ghost"
            size="sm"
            isIconOnly
            className="cursor-grab active:cursor-grabbing"
            aria-label={`Drag ${item.title}`}
          >
            <GripVertical size={16} />
          </Button>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="sm:hidden"
              aria-label={`Move ${item.title} earlier`}
              isDisabled={position === 0}
              onPress={() => onMove(group, item.id, items[position - 1].id)}
            >
              <ArrowUp size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="sm:hidden"
              aria-label={`Move ${item.title} later`}
              isDisabled={position === items.length - 1}
              onPress={() => onMove(group, item.id, items[position + 1].id, "after")}
            >
              <ArrowDown size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              aria-label={`Hide ${item.title}`}
              onPress={() => onHide(item.id)}
            >
              <X size={14} />
            </Button>
          </div>
        </div>
      )}
      {item.content}
    </article>
  );
  if (!items.length && !onCustomize)
    return (
      <p className="text-sm text-muted">
        No {group === "cards" ? "cards" : "charts"} shown. Use Customize dashboard to add them back.
      </p>
    );
  if (!editing)
    return (
      <div className={grid}>
        {items.map((item, index) => (
          <div key={item.id} className={`min-w-0 ${chartSpan(item.id)}`}>
            {panel(item, index)}
          </div>
        ))}
        {onCustomize && (
          <Button
            variant="outline"
            aria-label={`Customize ${group}`}
            onPress={onCustomize}
            className={`h-full min-h-28 w-full flex-col gap-2 border border-dashed border-border text-muted ${cardClass("sm")}`}
          >
            <SlidersHorizontal size={20} />
            Customize
          </Button>
        )}
      </div>
    );
  return (
    <GridList
      ref={gridRef}
      aria-label={group === "cards" ? "Reorder cards" : "Reorder charts"}
      items={items}
      dependencies={[items, onMove, onHide]}
      layout="grid"
      selectionMode="none"
      dragAndDropHooks={dragAndDropHooks}
      className={`relative ${grid}`}
    >
      {(item) => (
        <GridListItem
          id={item.id}
          textValue={item.title}
          className={`min-w-0 rounded-panel outline-none data-[dragging]:opacity-30 data-[dragging]:ring-2 data-[dragging]:ring-accent data-[focus-visible]:status-focused motion-safe:transition-[opacity,box-shadow] ${chartSpan(item.id)}`}
        >
          {panel(
            item,
            items.findIndex((candidate) => candidate.id === item.id),
          )}
        </GridListItem>
      )}
    </GridList>
  );
}

function FloatingLayoutSave({
  visible,
  saving,
  error,
  onSave,
}: {
  visible: boolean;
  saving: boolean;
  error: string;
  onSave: () => Promise<void>;
}) {
  if (!visible) return null;
  return (
    <div
      role="group"
      aria-label="Save layout reminder"
      className="fixed right-4 bottom-[calc(1rem+var(--app-tab-bar-height,env(safe-area-inset-bottom)))] z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2"
    >
      {error && <InlineAlert className={cardClass("sm", "floating")}>{error}</InlineAlert>}
      <Button
        variant="primary"
        aria-label="Save layout"
        isDisabled={saving}
        onPress={onSave}
        className="shadow-lg"
      >
        {saving ? "Saving…" : "Save layout"}
      </Button>
    </div>
  );
}

/** Fixed stat and chart grids keep user-defined orders tidy at every screen size. */
export function AnalyticsWorkspace({
  cards,
  charts,
  canCustomize = false,
  initialLayout = DEFAULT_ANALYTICS_LAYOUT,
  children,
  heading,
  onSave,
}: {
  cards: AnalyticsPanel[];
  charts: AnalyticsPanel[];
  canCustomize?: boolean;
  initialLayout?: AnalyticsLayout;
  children?: ReactNode;
  /** Shares a row with Customize. */
  heading?: ReactNode;
  onSave?: (layout: AnalyticsLayout) => Promise<ActionResult>;
}) {
  const [layout, setLayout] = useState(initialLayout);
  const [saved, setSaved] = useState(initialLayout);
  const [editing, setEditing] = useState(false);
  const isEditing = editing && canCustomize;
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const [showFloatingSave, setShowFloatingSave] = useState(false);
  useEffect(() => {
    const button = saveButtonRef.current;
    if (!editing || !canCustomize || !button) return;
    const update = () => setShowFloatingSave(button.getBoundingClientRect().bottom <= 0);
    const observer = new IntersectionObserver(update);
    observer.observe(button);
    // A quick jump can move the button from below to above the viewport
    // without changing its intersection state, so also observe scrolling.
    window.addEventListener("scroll", update, { passive: true, capture: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
    };
  }, [editing, canCustomize]);
  const editorRef = useRef<HTMLDivElement>(null);
  const focusEditor = useRef(false);
  const openEditor = () => {
    setShowFloatingSave(false);
    focusEditor.current = true;
    setEditing(true);
  };
  useIsomorphicLayoutEffect(() => {
    if (editing && focusEditor.current) {
      editorRef.current?.focus({ preventScroll: true });
      editorRef.current?.scrollIntoView({ block: "start" });
      focusEditor.current = false;
    }
  }, [editing]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const change = (next: AnalyticsLayout, announcement: string) => {
    if (!canCustomize || saving) return;
    setLayout(next);
    setMessage(announcement);
    setSaveError("");
  };
  const finish = async () => {
    if (!canCustomize || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const result = await onSave?.(layout);
      if (result && !result.ok) {
        setSaveError(result.error);
        return;
      }
      setSaved(layout);
      setEditing(false);
      setMessage("Dashboard layout saved.");
    } catch {
      setSaveError("Your layout couldn’t be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const move = (
    group: Group,
    source: AnalyticsItemId,
    target: AnalyticsItemId,
    position: "before" | "after" = "before",
  ) => {
    const order = moveAnalyticsItem<AnalyticsItemId>(layout[group], source, target, position);
    change(parseAnalyticsLayout({ ...layout, [group]: order }), "Layout updated.");
  };
  const hide = (id: AnalyticsItemId) =>
    change(
      {
        ...layout,
        cards: layout.cards.filter((item) => item !== id),
        charts: layout.charts.filter((item) => item !== id),
      },
      "Item hidden. You can add it back while customizing.",
    );
  const visible = (group: Group, items: AnalyticsPanel[]) =>
    layout[group].flatMap((id) => {
      const item = items.find((candidate) => candidate.id === id);
      return item ? [item] : [];
    });
  const hiddenGroups: { label: string; key: Group; items: AnalyticsPanel[] }[] = [
    {
      label: "At a glance",
      key: "cards",
      items: cards.filter((item) => !layout.cards.some((id) => id === item.id)),
    },
    {
      label: "Charts",
      key: "charts",
      items: charts.filter((item) => !layout.charts.some((id) => id === item.id)),
    },
  ];
  const customizeButton =
    canCustomize && !editing ? (
      <Button variant="outline" size="sm" aria-label="Customize dashboard" onPress={openEditor}>
        <SlidersHorizontal size={16} />
        Customize
      </Button>
    ) : null;
  return (
    <div className={`flex flex-col gap-6 ${editing ? "pb-24" : ""}`}>
      <SectionHeading className="sr-only">Analytics</SectionHeading>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">{heading}</div>
        {canCustomize && (
          <FeatureAnnouncement
            featureId={ANALYTICS_CUSTOMIZE_ANNOUNCEMENT.featureId}
            placement="bottom end"
            isEnabled={!editing}
          >
            {customizeButton}
          </FeatureAnnouncement>
        )}
      </div>
      {isEditing && (
        <div
          ref={editorRef}
          tabIndex={-1}
          aria-label="Customize your analytics dashboard"
          className={`flex flex-col gap-3 border border-border ${cardClass("sm")}`}
        >
          <SectionHeading>Customize your analytics dashboard</SectionHeading>
          <p className="text-sm text-muted">
            Add items below, drag to reorder, or use X to hide items. Click Save layout when you’re
            done. This only affects your own view.
          </p>
          {hiddenGroups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <fieldset key={group.label} className="min-w-0">
                <legend className={`${EYEBROW_CLASS} mb-2`} style={{ color: "var(--foreground)" }}>
                  {group.label}
                </legend>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
                  {group.items.map((item) => (
                    <Button
                      key={item.id}
                      variant="secondary"
                      isDisabled={saving}
                      aria-label={`Add ${item.title}`}
                      className={`h-auto min-h-20 w-full items-start justify-start gap-3 text-left whitespace-normal ${cardClass("sm", "bordered")}`}
                      style={{ borderWidth: 0 }}
                      onPress={() =>
                        change(
                          parseAnalyticsLayout({
                            ...layout,
                            [group.key]: [...layout[group.key], item.id],
                          }),
                          `${item.title} added.`,
                        )
                      }
                    >
                      <Plus size={16} className="mt-0.5 shrink-0" aria-hidden />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className={EYEBROW_CLASS}>{item.title}</span>
                        {item.description && (
                          <span className="text-xs font-normal text-muted">{item.description}</span>
                        )}
                      </span>
                    </Button>
                  ))}
                </div>
              </fieldset>
            ))}
          <div
            role="group"
            aria-label="Dashboard actions"
            className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3"
          >
            <Button
              size="sm"
              variant="ghost"
              isDisabled={saving}
              aria-label="Restore default layout"
              onPress={() => change(DEFAULT_ANALYTICS_LAYOUT, "Default layout restored.")}
            >
              Restore defaults
            </Button>
            <Button
              size="sm"
              variant="outline"
              isDisabled={saving}
              onPress={() => {
                setLayout(saved);
                setEditing(false);
                setSaveError("");
              }}
            >
              Cancel
            </Button>
            <Button
              ref={saveButtonRef}
              size="sm"
              variant="primary"
              aria-label="Save layout"
              isDisabled={saving}
              onPress={finish}
            >
              {saving ? "Saving…" : "Save layout"}
            </Button>
          </div>
        </div>
      )}
      {saveError && !showFloatingSave && <InlineAlert>{saveError}</InlineAlert>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {children}
      <section aria-label="At a glance" className="flex flex-col gap-4">
        <SectionHeading>At a glance</SectionHeading>
        <DashboardGroup
          onCustomize={
            canCustomize && !editing && hiddenGroups[0].items.length > 0 ? openEditor : undefined
          }
          group="cards"
          items={visible("cards", cards)}
          editing={isEditing}
          onMove={move}
          onHide={hide}
        />
      </section>
      <section aria-label="Charts" className="flex flex-col gap-4">
        <SectionHeading>Charts</SectionHeading>
        <DashboardGroup
          onCustomize={
            canCustomize && !editing && hiddenGroups[1].items.length > 0 ? openEditor : undefined
          }
          group="charts"
          items={visible("charts", charts)}
          editing={isEditing}
          onMove={move}
          onHide={hide}
        />
      </section>
      <FloatingLayoutSave
        visible={isEditing && showFloatingSave}
        saving={saving}
        error={saveError}
        onSave={finish}
      />
    </div>
  );
}
