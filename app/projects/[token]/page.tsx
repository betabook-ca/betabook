import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
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

/** The token and the viewer, or nulls. `getMemberSession` returns null for an
 * account that has not accepted the current terms, which lands such a reader
 * in the signed-out branch — right for `everyone`, and a sign-in callout
 * rather than a 404 for the others. */
async function resolve({ params }: SharedProjectPageProps) {
  const [{ token: raw }, session] = await Promise.all([params, getMemberSession()]);
  const token = parseProjectShareToken(raw);
  return { token, viewerId: session?.user.id ?? null };
}

/** An unfurl bot is a signed-out reader, so a Members or Friends link pasted
 * into a public channel has to preview as nothing. That means running the same
 * predicate here as the page does, not a plain token lookup. */
export async function generateMetadata(props: SharedProjectPageProps): Promise<Metadata> {
  const { token, viewerId } = await resolve(props);
  if (!token) return { title: "Shared project", robots: { index: false } };

  const db = await getDb();
  const project = await getSharedProject(db, token, viewerId);
  return project
    ? sharedProjectMetadata(project.ownerName, project.climbName)
    : { title: "Shared project", robots: { index: false } };
}

export default async function SharedProjectPage(props: SharedProjectPageProps) {
  const { token, viewerId } = await resolve(props);
  if (!token) notFound();

  const db = await getDb();
  const access = await getProjectShareAccess(db, token, viewerId);

  // A reader who has to sign in gets the callout rather than a 404: they may
  // well be inside the audience once they do.
  if (access.status === "needs-sign-in") return <CurrentPageAuthCallout />;
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

  const [project, sessions] = await Promise.all([
    getSharedProject(db, token, viewerId),
    getSharedProjectSessions(db, token, viewerId),
  ]);
  // Both reads re-run the predicate, so this also covers a share revoked
  // between the access check and them.
  if (!project) notFound();

  return (
    <SharedProject
      project={project}
      sessions={sessions}
      signedIn={viewerId !== null}
      path={projectSharePath(token)}
    />
  );
}
