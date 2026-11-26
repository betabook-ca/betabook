import { expect, it, vi } from "vitest";

import {
  isMobileHelperPaused,
  subscribeToMobileHelperPause,
  suspendMobileHelper,
} from "@/lib/mobile-helper-suspension";

it("keeps installation help paused until all active tours close, then permits it again", () => {
  const notify = vi.fn<() => void>();
  const unsubscribe = subscribeToMobileHelperPause(notify);
  const closeFirst = suspendMobileHelper();
  const closeSecond = suspendMobileHelper();
  expect(isMobileHelperPaused()).toBe(true);
  closeFirst();
  expect(isMobileHelperPaused()).toBe(true);
  closeSecond();
  expect(isMobileHelperPaused()).toBe(false);
  expect(notify).toHaveBeenCalledTimes(4);
  unsubscribe();
  const closeAfterUnsubscribe = suspendMobileHelper();
  closeAfterUnsubscribe();
  expect(notify).toHaveBeenCalledTimes(4);
});
