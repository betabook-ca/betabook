"use client";

import { Button, useOverlayState } from "@heroui/react";
import { CirclePlus } from "lucide-react";
import type { ReactNode } from "react";

import { ClimbListActions } from "@/components/climb-lists/climb-list-actions";
import { ClimbListDialog } from "@/components/climb-lists/climb-list-dialog";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/typography";
import type { ClimbListSummary } from "@/db/queries";
import { climbCountLabel, climbListHref } from "@/lib/climb-lists";

/** A climber's lists, most recently changed first. Like trips there is no
 * toolbar: the cap in lib/climb-lists.ts keeps this to a screen or two. */
export function ClimbListIndex({
  lists,
  userId,
  canEdit,
  note,
}: {
  lists: ClimbListSummary[];
  userId: string;
  /** True when the owner is viewing their own lists. */
  canEdit: boolean;
  /** Shown above the lists, such as who can see them. */
  note?: ReactNode;
}) {
  const createState = useOverlayState();

  const newList = (className?: string) => (
    <Button onPress={createState.open} className={className}>
      <CirclePlus className="size-4" />
      New list
    </Button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeading className="sr-only">Lists</SectionHeading>
      {(note || (canEdit && lists.length > 0)) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted">{note}</div>
          {canEdit && lists.length > 0 && newList()}
        </div>
      )}

      {lists.length === 0 && (
        <EmptyState message="No lists yet." cta={canEdit ? newList() : undefined} />
      )}

      {lists.length > 0 && (
        <ul className="flex flex-col gap-3">
          {lists.map((list) => (
            <li key={list.id} className={`flex flex-col gap-2 ${cardClass("sm", "bordered")}`}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <AppLink href={climbListHref(userId, list.id)} className="font-medium">
                    {list.title}
                  </AppLink>
                  <p className="text-sm text-muted">{climbCountLabel(list.climbCount)}</p>
                </div>
                {canEdit && <ClimbListActions list={list} userId={userId} />}
              </div>
              {list.description && (
                <p className="line-clamp-2 text-sm leading-relaxed">{list.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && <ClimbListDialog state={createState} userId={userId} mode={{ kind: "create" }} />}
    </div>
  );
}
