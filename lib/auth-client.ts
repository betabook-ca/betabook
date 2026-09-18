import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** `role` mirrors user.additionalFields in lib/auth.ts. */
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({ user: { role: { type: "string", required: false, input: false } } }),
  ],
});
