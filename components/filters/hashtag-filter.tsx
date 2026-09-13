"use client";

import { TagsField } from "@/components/ui/tags-field";

/** Filters select only existing tags; the shared input also supports tag creation in Log entry. */
export function HashtagFilter({
  value,
  onChange,
  tags,
  inlineLabel = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  tags: string[];
  inlineLabel?: boolean;
}) {
  return <TagsField value={value} onChange={onChange} tags={tags} inlineLabel={inlineLabel} />;
}
