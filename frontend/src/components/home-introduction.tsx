import { LandingHero } from "@/components/landing-page";
import { SectionHeading } from "@/components/ui/typography";
import { LOGBOOK_PAGE } from "@/lib/landing-pages";
import { signUpUrl } from "@/lib/sign-in-redirect";

export function HomeIntroduction() {
  return (
    <div className="flex flex-col gap-6">
      <LandingHero
        title="A free climbing logbook and crag database"
        lead="Log bouldering, sport and trad sends and sessions, and search routes and problems below."
        actions={[
          { href: signUpUrl(), label: "Create a free account" },
          { href: LOGBOOK_PAGE.path, label: "How Betabook works" },
        ]}
      />
      <SectionHeading className="mt-2">Search climbs and areas</SectionHeading>
    </div>
  );
}
