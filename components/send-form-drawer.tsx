"use client";

import type { UseOverlayStateReturn } from "@heroui/react";

import { SendEditor } from "@/components/send-editor";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { EditableSend } from "@/db/queries";

type SendFormDrawerProps = {
  existingSend: EditableSend;
  state: UseOverlayStateReturn;
};

export function SendFormDrawer({ existingSend, state }: SendFormDrawerProps) {
  return (
    <ResponsiveDialog state={state} title="Edit send">
      <SendEditor sendId={existingSend.id} onDone={state.close} />
    </ResponsiveDialog>
  );
}
