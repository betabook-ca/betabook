import { notFound } from "next/navigation";

import { getPublicAncestorsById, getPublicAreaById } from "@/app/public-catalog-reads";
import { AreaBreadcrumbs } from "@/components/breadcrumbs";
import { PublicClimbSendList } from "@/components/public-climb-send-list";
import { JsonLd } from "@/components/ui/json-ld";
import { RatingStars } from "@/components/ui/rating-stars";
import { StatStrip } from "@/components/ui/stat-strip";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import { getPublicSendsForClimb } from "@/db/queries/public-catalog";
import { missingDescriptionMessage } from "@/lib/descriptions";
import type { PublicClimb } from "@/lib/public-catalog";
import { climbDescription, climbJsonLd, locationTrail } from "@/lib/seo";
import { areaHref, climbHref, withQuery } from "@/lib/slug";
import type { UrlParamsRecord } from "@/lib/url-params";

import { ClimbHeader } from "./climb-header";

export async function PublicClimbPage({
  climb,
  search,
}: {
  climb: PublicClimb;
  search: UrlParamsRecord;
}) {
  const db = await getDb();
  const path = climbHref(climb.id, climb.name);
  const [area, ancestors, sends] = await Promise.all([
    getPublicAreaById(climb.areaId),
    getPublicAncestorsById(climb.areaId),
    getPublicSendsForClimb(db, climb.id),
  ]);
  if (!area) notFound();
  const trail = locationTrail([...ancestors.map((a) => a.name), area.name]);
  return (
    <div className="flex flex-col gap-6">
      <JsonLd
        data={climbJsonLd({
          name: climb.name,
          path,
          description: climbDescription(climb, trail),
          crumbs: [
            { name: "Home", path: "/" },
            ...[...ancestors, area].map((a) => ({ name: a.name, path: areaHref(a.id, a.name) })),
            { name: climb.name, path },
          ],
        })}
      />
      <AreaBreadcrumbs ancestors={[...ancestors, area]} current={climb} />
      <ClimbHeader climb={climb}>
        <p className="mt-1 text-muted">{climb.description || missingDescriptionMessage()}</p>
      </ClimbHeader>
      <StatStrip
        cards={[
          {
            key: "summary",
            stats: [
              {
                label: "Community rating",
                value: <RatingStars rating={climb.avgRating} precision="decimal" />,
              },
              { label: "Logged ascents", value: climb.sendCount },
            ],
          },
        ]}
      />
      <div className="flex flex-col gap-3">
        <SectionHeading>Sends</SectionHeading>
        <PublicClimbSendList type={climb.type} sends={sends} next={withQuery(path, search)} />
      </div>
    </div>
  );
}
