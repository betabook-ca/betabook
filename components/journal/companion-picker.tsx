"use client";

import { Button } from "@heroui/react";
import { X } from "lucide-react";
import { useState } from "react";

import { SearchSelectionField } from "@/components/search/search-selection-field";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useSearchLookup, type LookupFetcher } from "@/hooks/use-search-lookup";
import { apiFetch } from "@/lib/api-client";
import { MAX_JOURNAL_COMPANIONS, type CompanionOption } from "@/lib/journal-companions";

async function fetchFriends(query: string, signal: AbortSignal): Promise<CompanionOption[]> {
  const response = await apiFetch(`/api/friends/companions?q=${encodeURIComponent(query)}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Friend lookup failed");
  const data = (await response.json()) as { friends: CompanionOption[] };
  return data.friends;
}

export function CompanionPicker({
  value,
  onChange,
  disabled = false,
  editing = false,
  fetcher = fetchFriends,
}: {
  value: CompanionOption[];
  onChange: (value: CompanionOption[]) => void;
  disabled?: boolean;
  editing?: boolean;
  fetcher?: LookupFetcher<CompanionOption>;
}) {
  const [query, setQuery] = useState("");
  const [cleared, setCleared] = useState(false);
  const full = value.length >= MAX_JOURNAL_COMPANIONS;
  const lookup = useSearchLookup({
    query,
    enabled: !disabled && !full,
    scope: value.map((friend) => friend.id).join(","),
    fetcher: async (text, signal) =>
      (await fetcher(text, signal)).filter(
        (friend) => !value.some((selected) => selected.id === friend.id),
      ),
  });
  return (
    <fieldset
      disabled={disabled}
      aria-label="Tagged friends"
      className={`${FIELD_WIDTH_CLASS.long} flex flex-col gap-2`}
    >
      <SearchSelectionField
        emptyMessage="No friends match."
        errorMessage="Couldn’t load friends. Your selections are kept."
        label="Find a friend to tag"
        labelSuffix={
          <HelpTooltip label="About tagged friends">
            Anyone who can read this entry sees who you tagged. Tagging doesn’t log the climb for
            them or share the entry with them.
            {editing && " Changes replace all tags, including hidden ones."}
          </HelpTooltip>
        }
        placeholder="Find a friend to tag…"
        query={query}
        isDisabled={disabled || full}
        usage={{ used: value.length, limit: MAX_JOURNAL_COMPANIONS, unit: "friends" }}
        helper={full ? "Remove a friend to add another." : undefined}
        status={lookup.status}
        onRetry={lookup.retry}
        onQueryChange={(text) => setQuery(text.slice(0, 100))}
        items={lookup.items.map((friend) => ({
          kind: "climber",
          id: friend.id,
          name: friend.name,
          image: friend.image,
          detail: "Friend",
        }))}
        onSelect={(item) => {
          const friend = lookup.items.find((candidate) => candidate.id === item.id);
          if (
            friend &&
            !disabled &&
            !full &&
            !value.some((selected) => selected.id === friend.id)
          ) {
            setCleared(false);
            onChange([...value, friend]);
            setQuery("");
          }
        }}
      />
      {value.length > 0 && (
        <ul aria-label="Selected friends" className="flex flex-wrap gap-2">
          {value.map((friend) => (
            <li key={friend.id} className="max-w-full min-w-0">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={disabled}
                aria-label={`Remove friend ${friend.name}`}
                onPress={() => onChange(value.filter((item) => item.id !== friend.id))}
                className="max-w-full"
              >
                <UserAvatar name={friend.name} image={friend.image} size="xs" className="-ms-1" />
                <span className="truncate">{friend.name}</span>
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="self-start"
          isDisabled={disabled}
          onPress={() => {
            onChange([]);
            setQuery("");
            setCleared(true);
          }}
        >
          Clear tagged friends
        </Button>
      )}
      {cleared && (
        <p role="status" className="text-xs text-muted">
          Tagged friends will be cleared when you save.
        </p>
      )}
    </fieldset>
  );
}
