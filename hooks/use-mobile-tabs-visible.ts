"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const INPUT_TYPES_WITHOUT_KEYBOARD = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function opensKeyboard(target: EventTarget | null) {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !INPUT_TYPES_WITHOUT_KEYBOARD.has(target.type);
  return target instanceof HTMLElement && target.isContentEditable;
}

/** The on-screen keyboard resizes the page up to the bar, which would cover the field. */
export function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => setTyping(opensKeyboard(event.target));
    const onFocusOut = (event: FocusEvent) => setTyping(opensKeyboard(event.relatedTarget));
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  return typing;
}

/** Shared by the tab bar and mobile menu so primary destinations never disappear. */
export function useMobileTabsVisible() {
  const pathname = usePathname();
  const typing = useTyping();
  return !typing && !pathname.startsWith("/tutorial/");
}
