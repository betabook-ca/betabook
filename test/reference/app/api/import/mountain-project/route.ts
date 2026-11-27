import { withApiSession } from "@/lib/api-session";
import { MountainProjectError, fetchMountainProjectTicks } from "@/lib/mountain-project-api";

/** The upstream path is fixed; only the numeric user ID varies. The library
 * validates it and gives each upstream request its own deadline. */
export const GET = withApiSession(async (_session, request: Request) => {
  try {
    const ticks = await fetchMountainProjectTicks(
      new URL(request.url).searchParams.get("userId") ?? "",
      request.signal,
    );
    return new Response(ticks.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "X-Mountain-Project-User": ticks.username,
      },
    });
  } catch (error) {
    // A client that disconnected is not an import failure.
    if (!(error instanceof MountainProjectError) && !request.signal.aborted)
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
  }
});
