import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

export function LiveSample({
  children,
  property = "background-color",
  name,
}: {
  children: ReactNode;
  property?: string;
  name: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  useLayoutEffect(() => {
    const read = () => {
      const element = ref.current?.firstElementChild;
      if (element) setValue(getComputedStyle(element).getPropertyValue(property).trim());
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    window.addEventListener("resize", read);
    void document.fonts.ready.then(read);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", read);
    };
  }, [property]);
  return (
    <div data-token={name} className="flex min-w-0 flex-col gap-2">
      <div ref={ref}>{children}</div>
      <code className="text-xs break-all">{name}</code>
      <output className="text-xs break-all text-muted">{value}</output>
    </div>
  );
}
export function ColorGrid({ names }: { names: string[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {names.map((name) => (
        <LiveSample key={name} name={name}>
          <div
            aria-hidden="true"
            className="h-16 rounded-xl border border-border"
            style={{ backgroundColor: `var(${name})` }}
          />
        </LiveSample>
      ))}
    </div>
  );
}
export function ColorPage({
  title,
  description,
  names,
}: {
  title: string;
  description: string;
  names: string[];
}) {
  return (
    <StoryPage title={title} description={description}>
      <p className="text-sm">
        Swatches and values are resolved by the browser from the live application CSS. Use the Paper
        / Ink toolbar to compare themes.
      </p>
      <ColorGrid names={names} />
    </StoryPage>
  );
}
