"use client";

import type { UseOverlayStateReturn } from "@heroui/react";
import { useState } from "react";

import { SendEditor } from "@/components/sends/send-editor";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { EditableSend } from "@/lib/logbook-types";

type SendFormDrawerProps = {
  existingSend: EditableSend;
  state: UseOverlayStateReturn;
};

export function SendFormDrawer({ existingSend, state }: SendFormDrawerProps) {
  const [pending, setPending] = useState(false);
  return (
    <ResponsiveDialog state={state} title="Edit send" isPending={pending}>
      <SendEditor sendId={existingSend.id} onDone={state.close} onPendingChange={setPending} />
    </ResponsiveDialog>
  );
}
