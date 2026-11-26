// A temporary, reference-counted pause shared by the tour and the mobile
// installation helper. It never changes the user's saved install preference.
let activeTours = 0;
const listeners = new Set<() => void>();

export function suspendMobileHelper(): () => void {
  activeTours += 1;
  for (const listener of listeners) listener();
  return () => {
    activeTours -= 1;
    for (const listener of listeners) listener();
  };
}

export function subscribeToMobileHelperPause(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isMobileHelperPaused(): boolean {
  return activeTours > 0;
}

export function mobileHelperServerSnapshot(): boolean {
  return false;
}
