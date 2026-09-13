"use client";

import { Button } from "@heroui/react";
import { useEffect, useState } from "react";

import { getSendEditorData } from "@/actions";
import { SendForm } from "@/components/send-form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { GENERIC_ERROR_MESSAGE } from "@/lib/action-result";

type EditorResult = Awaited<ReturnType<typeof getSendEditorData>>;

type SendEditorProps = (
  | { sendId: number; entryId?: never }
  | { entryId: number; sendId?: never }
) & { onDone: () => void };

export function SendEditor(props: SendEditorProps) {
  const key = props.sendId !== undefined ? `send-${props.sendId}` : `entry-${props.entryId}`;
  return <SendEditorContent key={key} {...props} />;
}

function SendEditorContent({ sendId, entryId, onDone }: SendEditorProps) {
  const [result, setResult] = useState<EditorResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const target = sendId !== undefined ? { sendId } : { entryId };
    void getSendEditorData(target).then(
      (value) => {
        if (active) setResult(value);
        return;
      },
      () => {
        if (active) setResult({ ok: false, error: GENERIC_ERROR_MESSAGE });
      },
    );
    return () => {
      active = false;
    };
  }, [sendId, entryId, attempt]);
  if (!result) return <p role="status">Loading send and journal details…</p>;
  if (!result.ok)
    return (
      <div className="flex flex-col gap-3">
        <InlineAlert>{result.error}</InlineAlert>
        <Button
          onPress={() => {
            setResult(null);
            setAttempt(attempt + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  return (
    <SendForm
      climb={result.value.climb}
      existingSend={result.value.send}
      existingEntry={result.value.entry}
      onDone={onDone}
    />
  );
}
