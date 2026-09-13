"use client";

import { Label, Switch, Select, ListBox } from "@heroui/react";

import { FieldFeedback } from "@/components/ui/field-support";
import { InlineAlert } from "@/components/ui/inline-alert";
import {
  SEND_COMMENT_AUDIENCES,
  SHARING_AUDIENCES,
  type SendCommentAudience,
  type SharingAudience,
} from "@/lib/privacy";

/** Controlled fields shared by Account and the local tutorial example. */
export function PrivacyFields({
  isPrivate,
  journalVisibility,
  sendCommentVisibility,
  onProfileChange,
  onJournalChange,
  onSendCommentChange,
  isPending = false,
  profileError,
  journalError,
  sendCommentError,
}: {
  isPrivate: boolean;
  journalVisibility: SharingAudience;
  sendCommentVisibility: SendCommentAudience;
  onProfileChange: (value: boolean) => void;
  onJournalChange: (value: SharingAudience) => void;
  onSendCommentChange: (value: SendCommentAudience) => void;
  isPending?: boolean;
  profileError?: string | null;
  journalError?: string | null;
  sendCommentError?: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Switch isDisabled={isPending} isSelected={isPrivate} onChange={onProfileChange}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            Private profile
          </Switch.Content>
        </Switch>
        <p className="text-xs text-muted">
          {isPrivate
            ? "Only you can see your profile and climbing history; climb pages list your sends without your name. Friends and request recipients can still see your name. Your saved audiences will apply when your profile is visible to members."
            : "Signed-in Betabook members can see your profile and send details: climbs, dates, ascent styles, ratings, and grades. Signed-out visitors see recent sends on climb pages without names. Choose who can read your commentary and journal below."}
        </p>
        {profileError && <InlineAlert>{profileError}</InlineAlert>}
      </div>
      <div className="flex flex-col gap-5 border-t border-separator pt-4">
        <AudienceField
          label="Send commentary"
          description="Notes on original sends, including the matching ascent note in your journal."
          options={SEND_COMMENT_AUDIENCES}
          value={isPrivate ? "private" : sendCommentVisibility}
          onChange={onSendCommentChange}
          disabled={isPrivate || isPending}
          error={sendCommentError}
        />
        <AudienceField
          label="Journal entries"
          description="Sessions, repeats, training, and journal tags. Also limits who sees you tagged in a friend’s entry; its author can see their own selection. Commentary on original sends uses the setting above."
          options={SHARING_AUDIENCES}
          value={isPrivate ? "private" : journalVisibility}
          onChange={onJournalChange}
          disabled={isPrivate || isPending}
          error={journalError}
        />
      </div>
      <p className="text-xs text-muted">
        {!isPrivate &&
          "Everyone adds signed-out visitors and search engines, and shows your name on your sends. Members means signed-in Betabook users. Friends means an accepted friend request. Audiences apply to past and future entries. "}
        Your sends still count toward community ratings.
      </p>
    </div>
  );
}

function AudienceField<T extends string>({
  label,
  description,
  options,
  value,
  onChange,
  disabled,
  error,
}: {
  label: string;
  description: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled: boolean;
  error?: string | null;
}) {
  return (
    <Select
      aria-label={`${label} audience`}
      selectedKey={value}
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      onSelectionChange={(key) => {
        const audience = options.find((option) => option.value === key);
        if (audience) onChange(audience.value);
      }}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map(({ value, label }) => (
            <ListBox.Item key={value} id={value} textValue={label}>
              {label}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
      <FieldFeedback helper={description} error={error} />
    </Select>
  );
}
