import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";

import { SendListShell } from "./send-list-shell";

it("renders the sends as a list of items", () => {
  render(
    <SendListShell
      sends={[{ id: 1 }, { id: 2 }, { id: 3 }]}
      renderRow={(send) => <span>Send {send.id}</span>}
      emptyState={<p>Empty</p>}
      hasMore={false}
      onLoadMore={() => {}}
      loadingMore={false}
      loadMoreFailed={false}
    />,
  );
  const rows = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(rows.map((row) => row.textContent)).toEqual(["Send 1", "Send 2", "Send 3"]);
});
