import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { PageTitle } from "@/components/ui/typography";

type NotFoundMessageProps = {
  heading: string;
  message: ReactNode;
  /** Where to go instead. Defaults to search; `null` when the message
   * already carries its own link. */
  link?: ReactNode;
};

/** The page body for a URL that names nothing: a missing page, climb, area,
 * climber, list or project. */
export function NotFoundMessage({ heading, message, link }: NotFoundMessageProps) {
  return (
    <div className="flex flex-col gap-2">
      <PageTitle>{heading}</PageTitle>
      <p className="text-muted">{message}</p>
      {link === undefined ? (
        <AppLink href="/search" className="self-start">
          Find climbs
        </AppLink>
      ) : (
        link
      )}
    </div>
  );
}
