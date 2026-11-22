import { useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { QueryInput } from "@/components/ui/query-input";

import { SAMPLE_JOURNAL } from "./catalog-data";
import { StoryPage } from "./story-layout";
import { useSettledValue } from "./use-settled-value";

/** Isolated text-input behavior. Full toolbar compositions use FilterToolbarDemo. */
export function LocalFiltersDemo() {
  const [query, setQuery] = useState("");
  const [settled] = useSettledValue(query.trim().toLowerCase(), 300);
  const entries = SAMPLE_JOURNAL.filter((entry) =>
    `${entry.name} ${entry.detail}`.toLowerCase().includes(settled),
  );
  return (
    <StoryPage
      title="Text filter"
      description="Isolated text-field example. See Patterns / Filters for the current production toolbars."
    >
      <QueryInput label="Filter journal" value={query} onChange={setQuery} />
      <div aria-busy={query.trim().toLowerCase() !== settled} className="divide-y divide-separator">
        {entries.map((entry) => (
          <ListRow key={entry.id} title={entry.name} subtitle={entry.detail} />
        ))}
      </div>
      {entries.length === 0 && <EmptyState message="No matching entries. Clear the text filter." />}
    </StoryPage>
  );
}
