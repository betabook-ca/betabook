"use client";

import { Button, Modal, Tooltip } from "@heroui/react";
import { X } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";

import {
  CHART_PREVIEW_LIMIT,
  uniqueChartClimbs,
  sendChartRows,
  type ChartDetailGroup,
  type ChartSend,
} from "@/lib/chart-details";
import { formatCount } from "@/lib/format";

function heading(group: ChartDetailGroup): string {
  return [group.title, group.summary].filter(Boolean).join(" · ");
}

export function ChartDetailsPreview({ group }: { group: ChartDetailGroup }) {
  const rows = uniqueChartClimbs(group.rows);
  return (
    <div className="flex flex-col gap-1 text-xs">
      <p className="font-semibold">{heading(group)}</p>
      {rows.slice(0, CHART_PREVIEW_LIMIT).map((row) => (
        <p key={row.climbId}>{row.climbName}</p>
      ))}
      {rows.length > CHART_PREVIEW_LIMIT && <p className="text-muted">Select to see all</p>}
    </div>
  );
}

export function ChartDetailsDialog({
  group,
  onClose,
}: {
  group: ChartDetailGroup | null;
  onClose: () => void;
}) {
  const rows = uniqueChartClimbs(group?.rows ?? []);
  return (
    <Modal.Backdrop
      isOpen={group != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container size="xs" placement="center">
        <Modal.Dialog className="w-max max-w-[min(24rem,calc(100vw-2rem))] gap-0 border border-separator p-3">
          <Modal.Header className="flex-row items-center justify-between gap-2">
            <Modal.Heading className="text-xs">{group ? heading(group) : ""}</Modal.Heading>
            <Button
              isIconOnly
              aria-label="Close"
              variant="ghost"
              className="size-6 min-w-0 shrink-0"
              onPress={onClose}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </Modal.Header>
          <Modal.Body>
            <div className="max-h-[60vh] overflow-auto">
              <ul aria-label="Climbs" className="space-y-0.5 text-xs">
                {rows.map((row) => (
                  <li key={row.climbId} className="break-words">
                    {row.climbName}
                  </li>
                ))}
              </ul>
            </div>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

export function ChartClimbDetails({
  label,
  sends,
  children,
  className,
  style,
  hideSingleCount = false,
}: {
  label: string;
  hideSingleCount?: boolean;
  sends: ChartSend[];
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const rows = sendChartRows(sends);
  const hasMore = uniqueChartClimbs(rows).length > CHART_PREVIEW_LIMIT;
  const countLabel = hideSingleCount && sends.length === 1 ? "" : formatCount(sends.length, "send");
  const group = {
    title: label,
    summary: countLabel,
    rows,
  };
  return (
    <>
      <Tooltip.Root delay={200} isOpen={preview && !(hasMore && open)} onOpenChange={setPreview}>
        <Button
          variant="ghost"
          className={className}
          style={style}
          aria-label={`${label}${countLabel ? `: ${countLabel}` : ""}. ${hasMore ? "Show all climbs" : "Preview climbs"}`}
          aria-haspopup={hasMore ? "dialog" : undefined}
          onPress={() => {
            if (hasMore) {
              setPreview(false);
              setOpen(true);
            } else {
              setOpen(false);
              setPreview(true);
            }
          }}
        >
          {children}
        </Button>
        <Tooltip.Content placement="top" className="max-w-xs break-words">
          <ChartDetailsPreview group={group} />
        </Tooltip.Content>
      </Tooltip.Root>
      <ChartDetailsDialog group={hasMore && open ? group : null} onClose={() => setOpen(false)} />
    </>
  );
}
