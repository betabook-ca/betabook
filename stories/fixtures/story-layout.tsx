import type { ReactNode } from "react";

import { PageTitle, SectionHeading } from "@/components/ui/typography";

export function StoryPage({
  title,
  children,
  description,
}: {
  title: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageTitle>{title}</PageTitle>
      {description && <p className="text-sm text-muted">{description}</p>}
      {children}
    </div>
  );
}
export function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <SectionHeading>{title}</SectionHeading>
      {children}
    </section>
  );
}
