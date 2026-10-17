"use client";

import { useState, useTransition } from "react";

import {
  setJournalVisibility,
  setSendCommentVisibility,
  setTripVisibility,
  setUserPrivate,
} from "@/actions";
import { PrivacyFields } from "@/components/privacy-fields";
import type { SendCommentAudience, SharingAudience } from "@/lib/privacy";

type Audiences = {
  journal: SharingAudience;
  sendComment: SendCommentAudience;
  trips: SharingAudience;
};
type ContentKind = keyof Audiences;

const SAVE_AUDIENCE: Record<ContentKind, typeof setJournalVisibility> = {
  journal: setJournalVisibility,
  sendComment: setSendCommentVisibility,
  trips: setTripVisibility,
};

export function PrivacyControls({
  initialIsPrivate,
  initialJournalVisibility,
  initialSendCommentVisibility,
  initialTripVisibility,
}: {
  initialIsPrivate: boolean;
  initialJournalVisibility: SharingAudience;
  initialSendCommentVisibility: SendCommentAudience;
  initialTripVisibility: SharingAudience;
}) {
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const [audiences, setAudiences] = useState<Audiences>({
    journal: initialJournalVisibility,
    sendComment: initialSendCommentVisibility,
    trips: initialTripVisibility,
  });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ContentKind, string>>>({});
  const [isPending, startTransition] = useTransition();

  function handleProfileChange(next: boolean) {
    setIsPrivate(next);
    setProfileError(null);
    startTransition(async () => {
      try {
        const result = await setUserPrivate(next);
        if (!result.ok) {
          setIsPrivate(!next);
          setProfileError(result.error);
        }
      } catch {
        setIsPrivate(!next);
        setProfileError("Couldn't save profile privacy. Try again.");
      }
    });
  }

  function handleAudienceChange<K extends ContentKind>(kind: K, next: Audiences[K]) {
    const previous = audiences[kind];
    setAudiences((current) => ({ ...current, [kind]: next }));
    setErrors((current) => ({ ...current, [kind]: undefined }));
    startTransition(async () => {
      try {
        const result = await SAVE_AUDIENCE[kind](next);
        if (!result.ok) {
          setAudiences((current) => ({ ...current, [kind]: previous }));
          setErrors((current) => ({ ...current, [kind]: result.error }));
        }
      } catch {
        setAudiences((current) => ({ ...current, [kind]: previous }));
        setErrors((current) => ({ ...current, [kind]: "Couldn't save this audience. Try again." }));
      }
    });
  }

  return (
    <PrivacyFields
      isPrivate={isPrivate}
      journalVisibility={audiences.journal}
      sendCommentVisibility={audiences.sendComment}
      tripVisibility={audiences.trips}
      onProfileChange={handleProfileChange}
      onJournalChange={(next) => handleAudienceChange("journal", next)}
      onSendCommentChange={(next) => handleAudienceChange("sendComment", next)}
      onTripsChange={(next) => handleAudienceChange("trips", next)}
      isPending={isPending}
      profileError={profileError}
      journalError={errors.journal}
      sendCommentError={errors.sendComment}
      tripsError={errors.trips}
    />
  );
}
