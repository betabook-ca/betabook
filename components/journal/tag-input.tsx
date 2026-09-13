"use client";

import { TagsField } from "@/components/ui/tags-field";
import { isValidJournalTag, MAX_JOURNAL_TAGS, MAX_JOURNAL_TAG_LENGTH } from "@/lib/journal";

export function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <TagsField
      value={value}
      onChange={onChange}
      allowCreate
      maxTags={MAX_JOURNAL_TAGS}
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
