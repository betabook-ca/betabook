"use client";

import { Switch } from "@heroui/react";
import { useId, useState, useTransition } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { SETTINGS_ROW_CLASS } from "@/components/ui/settings";
import { setSendAlertPreferences } from "@/spa/lib/actions-client";

export type SendAlertPreferences = { shareWithFriends: boolean; receive: boolean };

const SAVE_ERROR = "Couldn't save send alerts. Try again.";

export function SendAlertControls({ initial }: { initial: SendAlertPreferences }) {
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
      <AlertSwitch
        label="Alert friends when I log a send"
        description="Friends see your new sends under Notifications."
        isSelected={preferences.shareWithFriends}
        isDisabled={isPending}
        onChange={(value) => change("shareWithFriends", value)}
      />
      <AlertSwitch
        label="Get alerts when friends log sends"
        description="Turn off to stop every send alert."
        isSelected={preferences.receive}
        isDisabled={isPending}
        onChange={(value) => change("receive", value)}
      />
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}

function AlertSwitch({
  label,
  description,
  isSelected,
  isDisabled,
  onChange,
}: {
  label: string;
  description: string;
  isSelected: boolean;
  isDisabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const descriptionId = useId();
  return (
    <div className="flex flex-col gap-1">
      <Switch
        isDisabled={isDisabled}
        isSelected={isSelected}
        onChange={onChange}
        aria-describedby={descriptionId}
      >
        <Switch.Content className="w-full justify-between gap-6">
          <span className="text-sm font-medium">{label}</span>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
      {/* Outside Switch: a saving switch fades its own description below AA contrast. */}
      <p id={descriptionId} className="text-sm text-pretty text-muted">
        {description}
      </p>
    </div>
  );
}
