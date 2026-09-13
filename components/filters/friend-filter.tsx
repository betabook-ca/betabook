"use client";

import { Button, ComboBox, Input, ListBox } from "@heroui/react";
import { X } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import { ComboBoxStateContext } from "react-aria-components";

import { FIELD_WIDTH_CLASS, FILTER_ROW_CLASS, FILTER_LABEL_CLASS } from "@/components/ui/field";
import type { CompanionOption } from "@/lib/journal-companions";

export function FriendFilter({
  value,
  friends,
  onChange,
}: {
  value: string[];
  friends: CompanionOption[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const items = friends.filter(
    (friend) =>
      !value.includes(friend.id) && friend.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className={FILTER_ROW_CLASS}>
      <span className={FILTER_LABEL_CLASS}>With friend</span>
      <div className={`${FIELD_WIDTH_CLASS.long} flex flex-col gap-2`}>
        <ComboBox
          aria-label="With friend"
          fullWidth
          allowsCustomValue
          allowsEmptyCollection
          menuTrigger="manual"
          inputValue={query}
          onInputChange={setQuery}
          selectedKey={null}
          items={items}
          onSelectionChange={(key) => {
            const friend = items.find((item) => item.id === key);
            if (friend) {
              onChange([...value, friend.id]);
              setQuery("");
            }
          }}
        >
          <ComboBox.InputGroup>
            <FriendFilterInput scope={JSON.stringify(value)} />
            <ComboBox.Trigger className="hidden" />
          </ComboBox.InputGroup>
          <ComboBox.Popover>
            <ListBox
              renderEmptyState={() => (
                <p className="px-3 py-2 text-sm text-muted">No matching friends.</p>
              )}
            >
              {(friend: CompanionOption) => (
                <ListBox.Item id={friend.id} textValue={friend.name}>
                  {friend.name}
                </ListBox.Item>
              )}
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>
        {value.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {value.map((id) => {
              const name = friends.find((friend) => friend.id === id)?.name ?? "Selected friend";
              return (
                <Button
                  key={id}
                  size="sm"
                  variant="secondary"
                  className="max-w-full"
                  aria-label={`Remove friend ${name}`}
                  onPress={() => onChange(value.filter((selected) => selected !== id))}
                >
                  <span className="truncate">{name}</span>
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FriendFilterInput({ scope }: { scope: string }) {
  const state = useContext(ComboBoxStateContext);
  const previousScope = useRef(scope);
  useEffect(() => {
    if (previousScope.current !== scope) {
      previousScope.current = scope;
      state?.close();
    }
  }, [scope, state]);
  return (
    <Input
      placeholder="Select friends…"
      onClick={() => state?.open(null, "manual")}
      onChangeCapture={() => state?.open(null, "manual")}
    />
  );
}
