import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { PageTitle } from "@/components/ui/typography";

type NotFoundMessageProps = {
  heading: string;
  message: ReactNode;
};

export function NotFoundMessage({ heading, message }: NotFoundMessageProps) {
  return (
    <div className="flex flex-col gap-2">
      <PageTitle>{heading}</PageTitle>
      <p className="text-muted">{message}</p>
      <AppLink href="/" className="self-start">
        Search from the home page
      </AppLink>
    </div>
  );
}
