import { buttonVariants } from "@heroui/react";
import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import type { LandingPageLink } from "@/lib/landing-pages";

export type LandingAction = { href: string; label: string };
export type LandingFeature = { title: string; body: string };
export type LandingQuestion = { question: string; answer: ReactNode };

/** Wide enough for three feature cards across; running text inside keeps
 * About's max-w-2xl reading measure. */
export function LandingPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-12">{children}</div>;
}

/** The first action is the primary button. */
export function LandingHero({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lead: string;
  actions: LandingAction[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <PageTitle className="text-balance">{title}</PageTitle>
      <p className="max-w-2xl text-lg leading-relaxed text-pretty text-muted">{lead}</p>
      <div className="flex flex-wrap gap-3">
        {actions.map((action, index) => (
          <AppLink
            key={action.href}
            href={action.href}
            className={index === 0 ? buttonVariants() : buttonVariants({ variant: "outline" })}
          >
            {action.label}
          </AppLink>
        ))}
      </div>
    </div>
  );
}

export function LandingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>{title}</SectionHeading>
      {children}
    </section>
  );
}

export function FeatureList({ features }: { features: LandingFeature[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((feature) => (
        <li key={feature.title} className={`flex flex-col gap-2 ${cardClass("sm")}`}>
          <h3 className="font-semibold">{feature.title}</h3>
          <p className="text-sm leading-relaxed text-pretty text-muted">{feature.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="flex max-w-2xl flex-col gap-3">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-secondary font-display font-semibold tabular-nums"
          >
            {index + 1}
          </span>
          <p className="pt-0.5 leading-relaxed text-pretty">{step}</p>
        </li>
      ))}
    </ol>
  );
}

export function QuestionList({ questions }: { questions: LandingQuestion[] }) {
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {questions.map((item) => (
        <div key={item.question} className="flex flex-col gap-1">
          <h3 className="font-semibold">{item.question}</h3>
          <p className="leading-relaxed text-pretty text-muted">{item.answer}</p>
        </div>
      ))}
    </div>
  );
}

export function LandingLinks({ links }: { links: LandingPageLink[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((link) => (
        <li key={link.path} className={`flex flex-col gap-1 ${cardClass("sm")}`}>
          <AppLink href={link.path} className="self-start font-semibold">
            {link.label}
          </AppLink>
          <p className="text-sm leading-relaxed text-pretty text-muted">{link.description}</p>
        </li>
      ))}
    </ul>
  );
}
