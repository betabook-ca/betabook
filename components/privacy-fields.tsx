"use client";

import { Disclosure, Label, ListBox, Select, Switch } from "@heroui/react";
import { Fragment, useId } from "react";

import { FieldFeedback } from "@/components/ui/field-support";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SETTINGS_ROW_CLASS, SETTINGS_ROWS_CLASS } from "@/components/ui/settings";
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
  const profileDescriptionId = useId();
  return (
    <div className={SETTINGS_ROWS_CLASS}>
      <div className={`flex flex-col gap-3 ${SETTINGS_ROW_CLASS}`}>
        <div className="flex flex-col gap-1">
          <Switch
            isDisabled={isPending}
            isSelected={isPrivate}
            onChange={onProfileChange}
            aria-describedby={profileDescriptionId}
          >
            <Switch.Content className="w-full justify-between gap-6">
              <span className="text-sm font-medium">Private profile</span>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
          {/* Outside Switch: a saving switch fades its own description below AA contrast. */}
          <p id={profileDescriptionId} className="text-sm text-pretty text-muted">
            {isPrivate
              ? "Only you can see your profile and climbing history. Your audience choices are kept for when you turn this off."
              : "Signed-in members can see your profile and sends."}
          </p>
        </div>
        {profileError && <InlineAlert>{profileError}</InlineAlert>}
      </div>
      <AudienceField
        label="Send commentary"
        description="Notes on your sends"
        options={SEND_COMMENT_AUDIENCES}
        value={isPrivate ? "private" : sendCommentVisibility}
        onChange={onSendCommentChange}
        disabled={isPrivate || isPending}
        error={sendCommentError}
      />
      <AudienceField
        label="Journal and goals"
        description="Sessions, repeats, training and finished goals"
        options={SHARING_AUDIENCES}
        value={isPrivate ? "private" : journalVisibility}
        onChange={onJournalChange}
        disabled={isPrivate || isPending}
        error={journalError}
      />
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
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-0.5 ${SETTINGS_ROW_CLASS}`}
    >
      <Label className="col-start-1 row-start-1">{label}</Label>
      <Select.Trigger className="col-start-2 row-span-2 row-start-1 w-32">
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
      <div className="col-start-1 row-start-2">
        <FieldFeedback helper={description} error={error} className="text-sm text-pretty" />
      </div>
    </Select>
  );
}

const AUDIENCE_READERS = [
  [
    "Everyone",
    "Anyone, including signed-out visitors and search engines, with your name on those sends. Send commentary only.",
  ],
  ["Members", "Anyone signed in to Betabook."],
  ["Friends", "Climbers you're friends with."],
  ["Only me", "Just you."],
] as const;

export function PrivacyDetails({ defaultExpanded = false }: { defaultExpanded?: boolean }) {
  return (
    <Disclosure defaultExpanded={defaultExpanded} className="py-2">
      <Disclosure.Heading level={3} className="contents">
        <Disclosure.Trigger className="flex min-h-11 w-full items-center gap-2 text-sm font-medium">
          Who can see what
          <Disclosure.Indicator className="size-4" />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body style={{ padding: 0 }}>
          <div className="flex flex-col gap-4 pt-1 pb-3 text-sm text-muted">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
              {AUDIENCE_READERS.map(([audience, readers]) => (
                <Fragment key={audience}>
                  <dt className="font-medium text-foreground">{audience}</dt>
                  <dd>{readers}</dd>
                </Fragment>
              ))}
            </dl>
            <ul className="flex list-disc flex-col gap-1.5 ps-4">
              <li>Signed-out visitors see your recent sends on climb pages without your name.</li>
              <li>
                Anyone with your profile link sees your name, photo, send stats and latest sends.
                Going private resets the link.
              </li>
              <li>
                Sharing a project makes a link to that one climb. Anyone with the link sees your
                name, sessions, notes and send, so it overrides the audiences above for that climb
                and changes nothing about your feed. Climbers you tagged are not named. You choose
                when it expires, Stop sharing ends it, and going private ends every project link.
              </li>
              <li>
                Sharing a trip works the same way, for every session, note and send inside its
                dates. Only you can see your trips otherwise. Climbers you tagged are not named, you
                choose when the link expires, Stop sharing ends it, and going private ends every
                trip link.
              </li>
              <li>
                Unless your profile is private, friends of your friends may see you suggested.
              </li>
              <li>
                A private profile still shows your name to friends and to people you send requests
                to. Climb pages list your sends without it.
              </li>
              <li>
                Friends can see your finished goals in their feed when your Journal and goals
                audience includes them.
              </li>
              <li>Your note on a send follows Send commentary, including in your journal.</li>
              <li>
                Changes apply to past and future entries and goal achievements. Your sends still
                count toward community ratings.
              </li>
            </ul>
          </div>
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
