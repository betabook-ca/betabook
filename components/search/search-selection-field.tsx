"use client";

import { Button, ComboBox, Input, Label, ListBox } from "@heroui/react";
import type { ReactNode } from "react";
import { ButtonContext } from "react-aria-components";

import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { FieldHeader, FieldFeedback, type FieldUsage } from "@/components/ui/field-support";

import { SearchResultContent } from "./search-results";
import type { SearchResult, SearchStatus } from "./search-types";

/** Lookup results are supplied by the caller; free text never selects an ID. */
export function SearchSelectionField({
  label,
  labelSuffix,
  usage,
  helper,
  hideLabel = false,
  placeholder,
  query,
  onQueryChange,
  items,
  status,
  selectedId = null,
  onSelect,
  onRetry,
  isInvalid = false,
  isRequired = false,
  isDisabled = false,
  emptyMessage = "No matches.",
  errorMessage,
  validationError,
}: {
  usage?: FieldUsage;
  helper?: string;
  emptyMessage?: string;
  errorMessage?: string;
  validationError?: string;
  isInvalid?: boolean;
  isRequired?: boolean;
  isDisabled?: boolean;
  label: string;
  labelSuffix?: ReactNode;
  hideLabel?: boolean;
  placeholder?: string;
  query: string;
  onQueryChange: (query: string) => void;
  items: SearchResult[];
  status: SearchStatus;
  selectedId?: string | null;
  onSelect: (item: SearchResult) => void;
  onRetry: () => void;
}) {
  return (
    <div className={`${FIELD_WIDTH_CLASS.long} flex flex-col gap-2`}>
      <ComboBox
        aria-label={hideLabel ? label : undefined}
        isInvalid={isInvalid || status === "error"}
        isDisabled={isDisabled}
        isRequired={isRequired}
        validationBehavior={isRequired ? "aria" : undefined}
        inputValue={query}
        onInputChange={onQueryChange}
        selectedKey={selectedId}
        items={items}
        disabledKeys={items
          .filter((item) => status !== "ready" || item.disabledReason)
          .map((item) => item.id)}
        allowsCustomValue
        allowsEmptyCollection={query.trim().length > 0}
        menuTrigger="input"
        fullWidth
        onSelectionChange={(key) => {
          const item = items.find((item) => item.id === key);
          if (item && status === "ready" && !item.disabledReason) onSelect(item);
        }}
      >
        {!hideLabel && (
          <FieldHeader usage={usage}>
            <Label isRequired={isRequired}>{label}</Label>
            {/* Label help is independent of the combobox dropdown trigger. */}
            <ButtonContext.Provider value={null}>{labelSuffix}</ButtonContext.Provider>
          </FieldHeader>
        )}
        <ComboBox.InputGroup>
          <Input
            placeholder={placeholder ?? `Search ${label.toLowerCase()}…`}
            className="search-combo-input"
          />
          <ComboBox.Trigger className="hidden" />
        </ComboBox.InputGroup>
        <FieldFeedback
          helper={helper}
          error={
            status === "error"
              ? (errorMessage ?? `Couldn’t load ${label.toLowerCase()}.`)
              : validationError
          }
        />
        <ComboBox.Popover>
          <ListBox
            renderEmptyState={() => (
              <p role="status" className="px-3 py-2 text-sm text-muted">
                {status === "loading"
                  ? "Searching…"
                  : status === "error"
                    ? "Search unavailable."
                    : emptyMessage}
              </p>
            )}
          >
            {(item: SearchResult) => (
              <ListBox.Item
                id={item.id}
                textValue={item.name}
                aria-label={item.kind === "climber" ? item.name : undefined}
              >
                <span className="flex w-full min-w-0 items-center gap-3">
                  <SearchResultContent item={item} picking />
                </span>
              </ListBox.Item>
            )}
          </ListBox>
        </ComboBox.Popover>
      </ComboBox>
      {status === "error" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onPress={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
