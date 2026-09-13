type Snapshot = { userId: string | null; count: number | null };

/** Shared by the header and profile tabs. Counts never survive an account change. */
export function createFriendRequestCountStore(fetcher: typeof fetch = fetch) {
  let snapshot: Snapshot = { userId: null, count: null };
  let sequence = 0;
  let controller: AbortController | null = null;
  let lastAttemptAt = -Infinity;
  const listeners = new Set<() => void>();
  function publish(next: Snapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setUser(userId: string | null) {
      if (snapshot.userId === userId) return;
      sequence += 1;
      controller?.abort();
      controller = null;
      lastAttemptAt = -Infinity;
      publish({ userId, count: null });
    },
    // Passive navigation/focus checks share a one-minute cooldown, including
    // failed attempts. Mutation callers omit ifStale to refresh immediately.
    async refresh({ ifStale = false }: { ifStale?: boolean } = {}) {
      const userId = snapshot.userId;
      if (!userId) return;
      if (ifStale && (controller !== null || Date.now() - lastAttemptAt < 60_000)) return;
      lastAttemptAt = Date.now();
      sequence += 1;
      const request = sequence;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetcher("/api/friends?view=count", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Couldn't load friend requests");
        const data: unknown = await response.json();
        if (request !== sequence) return;
        const result = data as Partial<Snapshot> | null;
        if (
          !result ||
          result.userId !== userId ||
          typeof result.count !== "number" ||
          !Number.isSafeInteger(result.count) ||
          result.count < 0
        ) {
          throw new Error("Invalid request count");
        }
        publish({ userId, count: result.count });
      } catch {
        if (request === sequence) publish({ userId, count: null });
      } finally {
        if (request === sequence) controller = null;
      }
    },
  };
}
