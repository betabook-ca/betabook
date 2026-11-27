import { useRef, type KeyboardEvent } from "react";

function arrowStep(key: string): number {
  if (key === "ArrowRight" || key === "ArrowDown") return 1;
  if (key === "ArrowLeft" || key === "ArrowUp") return -1;
  return 0;
}

/** Keyboard behavior for a hand-drawn `role="radiogroup"` of buttons: one tab
 * stop on the selected item (the first when none is), and arrow keys that
 * select and focus the neighbouring item, wrapping at either end. Spread
 * `radioProps(index)` onto each `role="radio"` button. */
export function useRovingRadioGroup({
  count,
  selectedIndex,
  onSelect,
}: {
  count: number;
  /** -1 when nothing is selected. */
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tabbable = selectedIndex === -1 ? 0 : selectedIndex;

  return function radioProps(index: number) {
    return {
      tabIndex: index === tabbable ? 0 : -1,
      ref: (button: HTMLButtonElement | null) => {
        buttons.current[index] = button;
      },
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        const step = arrowStep(event.key);
        if (!step) return;
        event.preventDefault();
        const next = (index + step + count) % count;
        onSelect(next);
        buttons.current[next]?.focus();
      },
    };
  };
}
