/** Cache failures cannot turn a committed mutation into a rejected one. */
export function afterCommit(refresh: () => void) {
  try {
    refresh();
  } catch (error) {
    console.error("Saved successfully, but refreshing the page failed", error);
  }
}
