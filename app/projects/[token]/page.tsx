import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { SharedProject } from "@/components/shared-project";
import { cardClass } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import { getSharedProject, getSharedProjectSessions } from "@/db/queries";
import { projectSharePath } from "@/lib/project-share";
import { sharedProjectMetadata } from "@/lib/seo";
import { getMemberSession } from "@/lib/session";
import { parseShareToken } from "@/lib/share-token";
import { SITE_NAME } from "@/lib/site";

const getSharedProjectByToken = cache(async (token: string) =>
  getSharedProject(await getDb(), token),
);

type SharedProjectPageProps = {
  params: Promise<{ token: string }>;
};

/** A project link carries no audience, so there is no session to consult
 * before deciding what a reader may see: holding the token is the permission.
 * The session is read only to decide whether to show a sign-up prompt. */
export async function generateMetadata(props: SharedProjectPageProps): Promise<Metadata> {
  const token = parseShareToken((await props.params).token);
  if (!token) return { title: "Shared project", robots: { index: false } };

  const { project } = await getSharedProjectByToken(token);
  return project
    ? sharedProjectMetadata(project.ownerName, project.climbName, project.sent)
    : { title: "Shared project", robots: { index: false } };
}

export default async function SharedProjectPage(props: SharedProjectPageProps) {
  const token = parseShareToken((await props.params).token);
  if (!token) notFound();

  const db = await getDb();
  // The session decides the sign-up prompt, not what may be read, so it does
  // not gate the project read and rides alongside it.
  const [access, session] = await Promise.all([getSharedProjectByToken(token), getMemberSession()]);

  // Described as a state of the link rather than of the project: the reader is
  // not being refused, and nothing about the climber is disclosed either way.
  if (access.status === "expired") {
    return (
      <section aria-label="Expired link" className={`flex flex-col gap-2 ${cardClass("md")}`}>
        <PageTitle>This link has expired</PageTitle>
        <p className="text-sm text-muted">
          Shared projects on {SITE_NAME} can be set to expire. Ask the climber for a new link.
        </p>
      </section>
    );
  }
  if (access.status === "hidden") notFound();

  // Fetched only once the link is known good, and re-running the predicate
  // itself, so notes are never selected for a reader who may not read them --
  // including a share revoked between the two statements.
  const sessions = await getSharedProjectSessions(db, token);

  return (
    <SharedProject
      project={access.project}
      sessions={sessions}
      signedIn={session !== null}
      path={projectSharePath(token)}
    />
  );
}
