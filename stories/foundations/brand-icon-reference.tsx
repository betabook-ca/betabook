import { X } from "lucide-react";
import Image from "next/image";

import darkIcon from "@/assets/branding/betabook-icon-dark.svg";
import lightIcon from "@/assets/branding/betabook-icon-light.svg";
import darkSmallIcon from "@/assets/branding/betabook-icon-small-dark.svg";
import lightSmallIcon from "@/assets/branding/betabook-icon-small-light.svg";
import { SectionHeading } from "@/components/ui/typography";

export function BrandIconReference() {
  return (
    <section className="flex flex-col gap-3" aria-label="Compact icon reference">
      <SectionHeading>Compact icon</SectionHeading>
      <p className="text-sm text-muted">
        A stronger small-size cut keeps the mountain, checkmark, and sun readable in tabs and
        compact controls. Larger placements use the original fine taper.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { label: "Paper", theme: "light", icon: lightIcon, smallIcon: lightSmallIcon },
          { label: "Ink", theme: "dark", icon: darkIcon, smallIcon: darkSmallIcon },
        ].map(({ label, theme, icon, smallIcon }) => (
          <figure
            key={theme}
            data-theme={theme}
            className="flex min-w-0 flex-col gap-6 rounded-xl border border-border bg-background p-5 text-foreground"
          >
            <figcaption className="text-sm font-medium">{label}</figcaption>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted">Browser tab · 16px</span>
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                <Image
                  src={smallIcon}
                  alt="Betabook icon"
                  width={16}
                  height={16}
                  unoptimized
                  className="shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-xs">
                  Betabook · Your climbing log
                </span>
                <X size={12} aria-hidden="true" className="shrink-0 text-muted" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted">Compact header · 24px</span>
              <div className="flex items-center gap-2">
                <Image src={smallIcon} alt="" width={24} height={24} unoptimized />
                <span className="font-display text-2xl font-bold">betabook</span>
              </div>
            </div>
            <div className="flex items-center gap-4 border-t border-separator pt-4">
              <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface">
                <Image src={icon} alt="Betabook app icon" width={64} height={64} unoptimized />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">App tile</span>
                <span className="text-xs text-muted">Original mark · 64px</span>
              </div>
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
}
