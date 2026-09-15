import { createDb } from "@/db/client";
import { refreshDirtyGoalOwners } from "@/lib/goal-refresh-worker";

// @ts-ignore OpenNext generates this module during the production build.
import handler from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
  async scheduled(_controller, env) {
    await refreshDirtyGoalOwners(createDb(env.DB));
  },
} satisfies ExportedHandler<CloudflareEnv>;
