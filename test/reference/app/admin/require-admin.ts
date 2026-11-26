import { redirect } from "next/navigation";

import { NotAdminError, NotSignedInError } from "@/lib/action-result";
import { requireAdmin } from "@/lib/session";
import { signInUrl } from "@/lib/sign-in-redirect";

/** The /admin auth guard, run by the layout *and* each page — App Router
 * renders them in parallel, so a layout-only check wouldn't reliably cover a
 * direct page hit. Only the two auth outcomes redirect; anything else (a
 * transient session/DB failure) rethrows to the error boundary rather than
 * silently bouncing an actual admin to the homepage. */
export async function requireAdminOrRedirect(): Promise<Awaited<ReturnType<typeof requireAdmin>>> {
  try {
    return await requireAdmin();
  } catch (err) {
    if (err instanceof NotSignedInError) redirect(signInUrl("/admin/requests"));
    if (err instanceof NotAdminError) redirect("/");
    throw err;
  }
}
