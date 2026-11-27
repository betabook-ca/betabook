// Only this secondary workerd isolate has fixture HTTP responses. The primary
// smoke Worker still loads its release entry point and its original fetch.
// oxlint-disable-next-line import/no-relative-parent-imports -- bundle the actual release artifact.
export { default } from "../../../backend/worker/build/index.js";

const photo = "https://lh3.googleusercontent.com/pw/abcdefghijklmnopqrst";
let albumReads = 0;
globalThis.fetch = async function fixtureFetch(input) {
  const request = new Request(input);
  const url = new URL(request.url);
  if (
    url.origin === "https://kaya-beta.kayaclimb.com" &&
    url.pathname === "/graphql" &&
    request.method === "POST"
  ) {
    const { variables } = await request.json();
    if ("username" in variables) {
      const { username } = variables;
      const id = username === "mismatched" ? "8" : "7";
      return Response.json({
        data: { webUser: { id, username, is_private: username === "private" } },
      });
    }
    if (variables.offset === 0 && variables.climbTypeId === "1" && variables.includeTotal) {
      return Response.json({
        data: {
          webFilterDistributionForAscents: {
            data: [{ ascent_count: variables.userId === "8" ? 2 : 1 }],
          },
          webAscentsForUser: [{ id: "41", date: "2026-01-02", climb: { name: "Fixture climb" } }],
        },
      });
    }
  }
  if (url.origin === "https://www.mountainproject.com") {
    switch (url.pathname) {
      case "/user/123456789":
        return Response.redirect(url.origin + "/user/123456789/fixture-climber");
      case "/user/123456789/fixture-climber/tick-export":
        return new Response("Date,Route\n2026-01-02,Fixture climb\n", {
          headers: { "content-type": "text/csv" },
        });
      case "/user/123456788":
        return new Response(null, { status: 403 });
      default:
        throw new Error("Unexpected Mountain Project path");
    }
  }
  if (url.href === "https://photos.app.goo.gl/FixtureAlbum") {
    return Response.redirect("https://photos.google.com/share/FixtureAlbum?key=abcd");
  }
  if (url.href === "https://photos.google.com/share/FixtureAlbum?key=abcd" && albumReads === 0) {
    albumReads += 1;
    return new Response(`["${photo}",800,600,{"76647426":[4200,`, {
      headers: { "content-type": "text/html" },
    });
  }
  throw new Error("Unexpected upstream fixture request");
};
