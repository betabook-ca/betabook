"use client";
import { useState, useTransition } from "react";

import { removeMyJournalTag } from "@/actions";
import { CompanionList } from "@/components/journal/companion-list";
import { GENERIC_ERROR_MESSAGE } from "@/lib/action-result";
import type { JournalCompanion } from "@/lib/journal-companions";

export function JournalCompanions({
  entryId,
  initialCompanions,
}: {
  entryId: number;
  initialCompanions?: JournalCompanion[];
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
        const result = await removeMyJournalTag(entryId);
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
