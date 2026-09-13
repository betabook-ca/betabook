"use client";

import { Drawer } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";

import { SendEditor } from "@/components/send-editor";
import { PAGE_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import type { EditableSend, SendableClimb } from "@/db/queries";

type SendFormDrawerProps = {
  climb: SendableClimb;
  existingSend: EditableSend;
  state: UseOverlayStateReturn;
};

export function SendFormDrawer({ existingSend, state }: SendFormDrawerProps) {
  return (
    <Drawer.Backdrop isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Drawer.Content>
        <Drawer.Dialog className={`mx-auto w-full ${PAGE_MAX_WIDTH_CLASS}`}>
          <Drawer.Header>
            <Drawer.Heading>Edit send</Drawer.Heading>
            <Drawer.CloseTrigger />
          </Drawer.Header>
          <Drawer.Body>
            {state.isOpen && <SendEditor sendId={existingSend.id} onDone={state.close} />}
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
