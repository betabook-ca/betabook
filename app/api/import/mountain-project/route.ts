import { withApiSession } from "@/lib/api-session";
import { MountainProjectError, fetchMountainProjectTicks } from "@/lib/mountain-project-api";
import { parseMountainProjectUserId } from "@/lib/mountain-project-profile";

/** The upstream path is fixed; only the numeric user ID varies. */
export const GET = withApiSession(async (_session, request: Request) => {
  let userId: string;
  try {
    userId = parseMountainProjectUserId(new URL(request.url).searchParams.get("userId"));
  } catch {
    return Response.json(
      { error: "Enter a valid Mountain Project user ID or profile link." },
      { status: 400 },
    );
  }
  const controller = new AbortController();
  const cancelRequest = () => controller.abort();
  request.signal.addEventListener("abort", cancelRequest, { once: true });
  if (request.signal.aborted) cancelRequest();
  const timeout = setTimeout(() => controller.abort(), 2 * 60_000);
  try {
    const ticks = await fetchMountainProjectTicks(userId, controller.signal);
    return new Response(ticks.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "X-Mountain-Project-User": ticks.username,
      },
    });
  } catch (error) {
    if (!(error instanceof MountainProjectError))
      console.error("Mountain Project import failed", error);
    return Response.json(
      {
        error:
          error instanceof MountainProjectError
            ? error.message
            : "Couldn't load ticks from Mountain Project. Please try again.",
      },
      { status: error instanceof MountainProjectError ? error.status : 502 },
    );
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", cancelRequest);
  }
});
