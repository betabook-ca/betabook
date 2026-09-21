import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SharedProject } from "@/components/shared-project";
import { cardClass } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import { getProjectShareAccess, getSharedProject, getSharedProjectSessions } from "@/db/queries";
import { parseProjectShareToken, projectSharePath } from "@/lib/project-share";
import { sharedProjectMetadata } from "@/lib/seo";
import { getMemberSession } from "@/lib/session";
import { SITE_NAME } from "@/lib/site";

type SharedProjectPageProps = {
  params: Promise<{ token: string }>;
};

/** A project link carries no audience, so there is no session to consult
 * before deciding what a reader may see: holding the token is the permission.
 * The session is read only to decide whether to show a sign-up prompt. */
export async function generateMetadata(props: SharedProjectPageProps): Promise<Metadata> {
  const token = parseProjectShareToken((await props.params).token);
  if (!token) return { title: "Shared project", robots: { index: false } };

  const db = await getDb();
  const project = await getSharedProject(db, token);
  return project
    ? sharedProjectMetadata(project.ownerName, project.climbName)
    : { title: "Shared project", robots: { index: false } };
}

export default async function SharedProjectPage(props: SharedProjectPageProps) {
  const token = parseProjectShareToken((await props.params).token);
  if (!token) notFound();

  const db = await getDb();
  const access = await getProjectShareAccess(db, token);

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

  const [project, sessions, session] = await Promise.all([
    getSharedProject(db, token),
    getSharedProjectSessions(db, token),
    getMemberSession(),
  ]);
  // Both reads re-run the predicate, so this also covers a share revoked
  // between the access check and them.
  if (!project) notFound();

  return (
    <SharedProject
      project={project}
      sessions={sessions}
      signedIn={session !== null}
      path={projectSharePath(token)}
    />
  );
}
