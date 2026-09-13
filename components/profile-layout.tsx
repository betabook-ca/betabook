import type { ReactNode } from "react";

/** From `xl` the heading spans both rows as a side column; the flexible second
 * row keeps a tall heading from opening a gap under the tabs. */
export function ProfileLayout({
  heading,
  tabs,
  children,
}: {
  heading: ReactNode;
  tabs: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[17rem_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:gap-x-12">
      <aside aria-label="Climber summary" className="xl:sticky xl:top-6 xl:row-span-2">
        {heading}
      </aside>
      {tabs}
      {children}
    </div>
  );
}
