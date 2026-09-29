"use client";

import { useState, useTransition } from "react";

import { CompanionList } from "@/components/journal/companion-list";
import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";
import type { JournalCompanion } from "@/lib/journal-companions";

/** Tagged friends. A tagged viewer gets a button to remove their own tag. The
 * caller supplies the remove action, since entries and trips use different
 * ones. */
export function RemovableCompanions({
  initialCompanions,
  remove,
}: {
  initialCompanions?: JournalCompanion[];
  remove: () => Promise<ActionResult>;
}) {
  const [removedFrom, setRemovedFrom] = useState<JournalCompanion[] | undefined | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [removingTag, startRemovingTag] = useTransition();
  const companions =
    removedFrom === initialCompanions
      ? initialCompanions?.filter((friend) => !friend.isSelf)
      : initialCompanions;
  function removeTag() {
    setTagError(null);
    startRemovingTag(async () => {
      try {
        const result = await remove();
        if (result.ok) setRemovedFrom(initialCompanions);
        else setTagError(result.error);
      } catch {
        setTagError(GENERIC_ERROR_MESSAGE);
      }
    });
  }
  return (
    <CompanionList
      companions={companions}
      onRemoveSelf={removeTag}
      pending={removingTag}
      error={tagError}
    />
  );
}
