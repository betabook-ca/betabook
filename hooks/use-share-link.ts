"use client";

import { useMounted } from "@/hooks/use-mounted";
import { isMobileDevice } from "@/lib/mobile-detection";

/** Whether sharing opens the native share sheet. Desktop browsers that
 * implement navigator.share still copy the link instead. */
export function useNativeShare(): boolean {
  const mounted = useMounted();
  return mounted && "share" in navigator && isMobileDevice();
}

/** Resolves false when the viewer dismisses the share sheet. */
export async function openShareSheet(data: ShareData): Promise<boolean> {
  try {
    await navigator.share(data);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return false;
    throw error;
  }
}
