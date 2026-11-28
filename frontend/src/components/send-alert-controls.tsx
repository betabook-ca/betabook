"use client";

import { useState, useTransition } from "react";

import { PushDeviceControl } from "@/components/push-device-control";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SETTINGS_ROW_CLASS, SettingsSwitch } from "@/components/ui/settings";
import type { components } from "@/spa/generated/api";
import { setSendAlertPreferences } from "@/spa/lib/actions-client";

export type SendAlertPreferences = components["schemas"]["SendAlertPreferences"];

const SAVE_ERROR = "Couldn't save send alerts. Try again.";

export function SendAlertControls({
  initial,
  pushPublicKey,
}: {
  initial: SendAlertPreferences;
  pushPublicKey: string | null;
}) {
  const [preferences, setPreferences] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function change(key: keyof SendAlertPreferences, value: boolean) {
    const previous = preferences;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await setSendAlertPreferences(next);
        if (!result.ok) {
          setPreferences(previous);
          setError(result.error);
        }
      } catch {
        setPreferences(previous);
        setError(SAVE_ERROR);
      }
    });
  }

  return (
    <div className={`flex flex-col gap-3 ${SETTINGS_ROW_CLASS}`}>
      <SettingsSwitch
        label="Alert friends when I log a send"
        description="Friends see your new sends under Notifications."
        isSelected={preferences.shareWithFriends}
        isDisabled={isPending}
        onChange={(value) => change("shareWithFriends", value)}
      />
      <SettingsSwitch
        label="Get alerts when friends log sends"
        description="Turn off to stop every send alert."
        isSelected={preferences.receive}
        isDisabled={isPending}
        onChange={(value) => change("receive", value)}
      />
      {preferences.receive && pushPublicKey && <PushDeviceControl publicKey={pushPublicKey} />}
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
