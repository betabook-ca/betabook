import { Toast, toastQueue } from "@heroui/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { useIsAtLeast } from "@/hooks/use-breakpoint";

const ToastQueueContext = createContext(toastQueue);

/** The viewer boundary remounts this queue on identity changes. A previous
 * member's notifications disappear together with the views that emitted them. */
export function ViewerToasts({ children }: { children: ReactNode }) {
  const desktop = useIsAtLeast("md");
  const [queue] = useState(() => new Toast.Queue());
  useEffect(() => () => queue.destroy(), [queue]);
  return (
    <ToastQueueContext value={queue}>
      {children}
      <Toast.Provider queue={queue} placement={desktop ? "top end" : "top"} className="top-16" />
    </ToastQueueContext>
  );
}

export function useToastQueue() {
  return useContext(ToastQueueContext);
}
