import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { fn } from "storybook/test";

/** The auth server's answer, as a spy. A story scripts one with
 * mocked(authTransport).mockImplementation(async () => Response.json(...))
 * and the real client turns it into the callbacks production sees. Off
 * script, the 404 the gallery's own origin would give. */
export const authTransport = fn<typeof fetch>(async () =>
  Response.json({ message: "No auth server in the gallery." }, { status: 404 }),
);

// The client from lib/auth-client.ts, differing only in transport.
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({ user: { role: { type: "string", required: false, input: false } } }),
  ],
  fetchOptions: { customFetchImpl: authTransport },
});
