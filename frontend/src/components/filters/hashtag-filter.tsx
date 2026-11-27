"use client";

import { TagsField } from "@/components/ui/tags-field";

/** Filters select only existing tags; the shared input also supports tag creation in Log entry. */
export function HashtagFilter({
  value,
  onChange,
  tags,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  tags: string[];
}) {
  return <TagsField value={value} onChange={onChange} tags={tags} inlineLabel />;
}
