"use client";

import { Button } from "@heroui/react";
import { useEffect, useState, useTransition } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import {
  currentPushSubscription,
  disablePush,
  enablePush,
  pushSupport,
  type PushSupport,
} from "@/lib/push";

type DeviceState = "checking" | "off" | "on" | "blocked" | Exclude<PushSupport, "supported">;

function initialState(): DeviceState {
  if (typeof window === "undefined") return "checking";
  const support = pushSupport({ window, navigator });
  if (support !== "supported") return support;
  return Notification.permission === "denied" ? "blocked" : "checking";
}

/** Push for this browser, under the "Get alerts" switch. */
export function PushDeviceControl({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<DeviceState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (state !== "checking") return;
    let active = true;
    async function check() {
      const subscription = await currentPushSubscription().catch(() => null);
      if (active) setState(subscription ? "on" : "off");
    }
    void check();
    return () => {
      active = false;
    };
  }, [state]);

  function turnOn() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await enablePush(publicKey);
        if (result.ok) setState("on");
        else {
          setError(result.error);
          if (Notification.permission === "denied") setState("blocked");
        }
      } catch {
        setError("Couldn't turn on notifications. Try again.");
      }
    });
  }

  function turnOff() {
    setError(null);
    startTransition(async () => {
      try {
        await disablePush();
        setState("off");
      } catch {
        setError("Couldn't turn off notifications. Try again.");
      }
    });
  }

  const message = {
    checking: null,
    off: "Get a phone or desktop notification when friends send.",
    on: "Notifications are on for this device.",
    blocked: "Notifications are blocked for Betabook in this browser's settings.",
    install: "To get notifications on iPhone or iPad, add Betabook to your Home Screen first.",
    unsupported: "This browser can't show notifications.",
  }[state];

  return (
    <div className="flex flex-col gap-2">
      {message && <p className="text-sm text-pretty text-muted">{message}</p>}
      {state === "off" && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          isDisabled={isPending}
          onPress={turnOn}
        >
          Turn on for this device
        </Button>
      )}
      {state === "on" && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          isDisabled={isPending}
          onPress={turnOff}
        >
          Turn off for this device
        </Button>
      )}
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
