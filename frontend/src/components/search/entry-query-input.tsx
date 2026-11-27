import { SearchField } from "@heroui/react";
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";

import { FIELD_HEIGHT_CLASS, FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { SearchIcon } from "@/components/ui/search-icon";
import { usePublicEntryReady } from "@/spa/lib/public-entry";

/** Reuse the document's native input through the first route transition.
 * A replacement cannot preserve an in-flight keypress or caret selection. */
export function EntryQueryInput({
  value,
  onChange,
  placeholder,
  ready,
  onKeyDown,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ready: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const adoptedText = useRef<string | null>(null);
  usePublicEntryReady(ready, () => {
    const input = document.querySelector<HTMLInputElement>(
      '#public-entry input[type="search"][name="name"]',
    );
    if (!host.current || !input) return;
    const focused = document.activeElement === input;
    const { selectionStart, selectionEnd, selectionDirection } = input;
    const edited = input.value !== input.defaultValue;
    input.className = "search-field__input min-w-0";
    input.placeholder = placeholder;
    input.setAttribute("aria-label", "Search Betabook");
    host.current.appendChild(input);
    field.current = input;
    if (focused) {
      input.focus({ preventScroll: true });
      input.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? "none");
    }
    if (edited && input.value !== value) {
      adoptedText.current = input.value;
      // The child layout effect precedes the Router's own mount effect.
      // Adopt the DOM synchronously; submit its query after navigation is ready.
      queueMicrotask(() => {
        if (input.isConnected) onChange(input.value);
      });
    } else if (input.value !== value) input.value = value;
  });
  useLayoutEffect(() => {
    const input = field.current;
    if (!input) return;
    if (adoptedText.current !== null && value !== adoptedText.current) return;
    adoptedText.current = null;
    input.placeholder = placeholder;
    if (input.value !== value) input.value = value;
  }, [placeholder, value]);
  return (
    <SearchField
      aria-label="Search Betabook"
      value={value}
      onChange={onChange}
      className={FIELD_WIDTH_CLASS.long}
    >
      <SearchField.Group className={`${FIELD_HEIGHT_CLASS} min-w-0 focus-within:ring-2`}>
        <SearchField.SearchIcon>
          <SearchIcon />
        </SearchField.SearchIcon>
        <span
          ref={host}
          onKeyDownCapture={onKeyDown}
          className="contents"
          onInput={() => {
            if (field.current) onChange(field.current.value);
          }}
        />
        <SearchField.ClearButton
          aria-label="Clear search betabook"
          onPress={() => field.current?.focus()}
        />
      </SearchField.Group>
    </SearchField>
  );
}
