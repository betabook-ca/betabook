import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { expiredLinkCard } from "@/components/expired-link-card";
import { SharedProject } from "@/components/shared-project";
import { getDb } from "@/db/client";
import { getSharedProject, getSharedProjectSessions } from "@/db/queries";
import { projectSharePath } from "@/lib/project-share";
import { sharedProjectMetadata } from "@/lib/seo";
import { getMemberSession } from "@/lib/session";
import { parseShareToken } from "@/lib/share-token";

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

  if (access.status === "expired") return expiredLinkCard("projects");
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
