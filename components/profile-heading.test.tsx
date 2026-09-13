import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import type { HardestSend } from "@/db/queries/climber-overview";

import { ProfileHeading } from "./profile-heading";

const HARDEST: HardestSend[] = [
  { type: "boulder", grade: "V8" },
  { type: "sport", grade: "5.12a" },
];

const badges = (html: string) =>
  [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((match) => match[1].replace(/<[^>]+>/g, ""));

it("titles the profile and badges the hardest grade per discipline", () => {
  const html = renderToStaticMarkup(<ProfileHeading name="Alex Morgan" hardest={HARDEST} />);

  expect(html).toMatch(/<h1[^>]*>Alex Morgan<\/h1>/);
  expect(badges(html)).toEqual(["BoulderV8", "Sport5.12a"]);
});

it("keeps a name action on the name's row, above the badges", () => {
  const html = renderToStaticMarkup(
    <ProfileHeading
      name="Alex Morgan"
      hardest={HARDEST}
      nameAction={<button type="button">Copy profile link</button>}
    />,
  );

  expect(html).toMatch(/<h1[^>]*>Alex Morgan<\/h1><button[^>]*>Copy profile link<\/button>/);
  expect(html.indexOf("Copy profile link")).toBeLessThan(html.indexOf("Hardest sends"));
});

it("shows a note under the name", () => {
  const html = renderToStaticMarkup(
    <ProfileHeading
      name="Alex Morgan"
      hardest={HARDEST}
      note={<p>Their journal isn&apos;t shared with you.</p>}
    />,
  );

  expect(html).toContain("Their journal isn&#x27;t shared with you.");
});

it("leaves out badges before anything is sent", () => {
  const html = renderToStaticMarkup(<ProfileHeading name="Alex Morgan" hardest={[]} />);

  expect(html).not.toContain("Hardest sends");
  expect(badges(html)).toEqual([]);
});
