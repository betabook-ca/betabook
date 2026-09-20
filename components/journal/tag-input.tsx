"use client";

import { TagsField } from "@/components/ui/tags-field";
import { isValidJournalTag, MAX_JOURNAL_TAGS, MAX_JOURNAL_TAG_LENGTH } from "@/lib/journal";

export function TagInput({
  value,
  onChange,
  showUsage = true,
  showLabel = true,
  showHelper = true,
  sentenceLayout = false,
  availableTags,
  showExamples = true,
  onTagSelected,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  showUsage?: boolean;
  showLabel?: boolean;
  showHelper?: boolean;
  sentenceLayout?: boolean;
  availableTags?: string[];
  showExamples?: boolean;
  onTagSelected?: () => void;
}) {
  return (
    <TagsField
      value={value}
      onChange={onChange}
      allowCreate
      maxTags={MAX_JOURNAL_TAGS}
      showUsage={showUsage}
      showLabel={showLabel}
      showHelper={showHelper}
      sentenceLayout={sentenceLayout}
      tags={availableTags}
      showExamples={showExamples}
      onTagSelected={onTagSelected}
      validateTag={(tag) =>
        !isValidJournalTag(tag)
          ? "Tags can only contain letters, numbers and hyphens."
          : tag.length > MAX_JOURNAL_TAG_LENGTH
            ? `Tags can contain up to ${MAX_JOURNAL_TAG_LENGTH} characters.`
            : null
      }
    />
  );
}
