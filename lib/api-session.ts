import { getDb } from "@/db/client";
import { getTermsAcceptance } from "@/db/queries/terms";
import { getSession } from "@/lib/session";
import { hasAcceptedCurrentTerms, TERMS_ACCESS_MESSAGE } from "@/lib/terms";

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** Authenticate before parsing input or looking up records, including suggestions. */
export function withApiSession<Args extends unknown[]>(
  handler: (session: Session, ...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    let response: Response;
    try {
      const session = await getSession();
      const acceptance = session
        ? await getTermsAcceptance(await getDb(), session.user.id)
        : undefined;
      if (!session || !acceptance)
        response = Response.json({ error: "Not signed in" }, { status: 401 });
      else if (!hasAcceptedCurrentTerms(acceptance))
        response = Response.json(
          { error: TERMS_ACCESS_MESSAGE, code: "TERMS_ACCEPTANCE_REQUIRED" },
          { status: 428 },
        );
      else response = await handler(session, ...args);
    } catch (error) {
      console.error("Application data request failed", error);
      response = Response.json({ error: "Internal server error" }, { status: 500 });
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
}
