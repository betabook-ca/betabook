import { useLayoutEffect } from "react";
import { useOutletContext } from "react-router";

import type { ApiResponse } from "@/spa/lib/api";

export type VisitorHeader = Pick<
  ApiResponse<"/api/pages/users/{id}/sends">,
  "user" | "relationship" | "access" | "hardest"
>;

/** Pending loads keep the last authorized header for this viewer and climber.
 * A settled failure clears it before paint. Only header fields leave the tab. */
export function useVisitorHeader(data: VisitorHeader | null | undefined, error: unknown) {
  const publish = useOutletContext<((header: VisitorHeader | null) => void) | null>();
  useLayoutEffect(() => {
    if (!publish) return;
    if (data) {
      const { user, relationship, access, hardest } = data;
      publish({ user, relationship, access, hardest });
    } else if (error || data === null) publish(null);
  }, [data, error, publish]);
}
