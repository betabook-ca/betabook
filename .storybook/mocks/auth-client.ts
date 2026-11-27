import { fn } from "storybook/test";

import { createWorkerAuthClient } from "@/spa/lib/worker-auth";

/** The auth server's answer, as a spy. A story scripts one with
 * mocked(authTransport).mockImplementation(async () => Response.json(...))
 * and the real client turns it into the callbacks production sees. Off
 * script, the 404 the gallery's own origin would give. */
export const authTransport = fn<typeof fetch>(async () =>
  Response.json({ message: "No auth server in the gallery." }, { status: 404 }),
);

export const authClient = createWorkerAuthClient(authTransport);
