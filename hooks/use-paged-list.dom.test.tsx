import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { usePagedList } from "./use-paged-list";

type Row = { id: number; body: string };
type Page = { items: Row[]; hasMore: boolean; meta: Record<string, string> };
type FetchPage = (
  offset: number,
  page: number,
  last: Row | undefined,
  signal?: AbortSignal,
) => Promise<Page>;

const row = (id: number, body = `Entry ${id}`): Row => ({ id, body });
const page = (items: Row[], hasMore = true, meta = {}): Page => ({ items, hasMore, meta });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function useList(initial: Page, fetchPage: FetchPage) {
  return usePagedList({
    initialItems: initial.items,
    initialHasMore: initial.hasMore,
    initialMeta: initial.meta,
    itemKey: (item) => item.id,
    mergeMeta: (current, incoming) => ({ ...current, ...incoming }),
    fetchPage,
  });
}
function List({ initial, fetchPage }: { initial: Page; fetchPage: FetchPage }) {
  const list = useList(initial, fetchPage);
  return (
    <>
      {list.items.map((item) => (
        <details key={item.id}>
          <summary>{item.body}</summary>
          <input aria-label={`Draft ${item.id}`} defaultValue="" />
        </details>
      ))}
      <button
        type="button"
        onClick={() => {
          void list.loadMore();
        }}
      >
        Load more
      </button>
    </>
  );
}

it("keeps loaded rows, expanded details and drafts mounted throughout a background refresh", async () => {
  const user = userEvent.setup();
  const refresh = deferred<Page>();
  const fetchPage = vi
    .fn<FetchPage>()
    .mockResolvedValueOnce(page([row(2)], false))
    .mockReturnValueOnce(refresh.promise);
  const { rerender } = render(<List initial={page([row(1)])} fetchPage={fetchPage} />);
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await user.click(await screen.findByText("Entry 2"));
  const draft = screen.getByRole("textbox", { name: "Draft 2" });
  await user.type(draft, "Unsaved notes");
  const details = draft.closest("details");
  rerender(<List initial={page([row(1)])} fetchPage={fetchPage} />);
  expect(screen.getByRole("textbox", { name: "Draft 2" })).toBe(draft);
  expect(details).toHaveAttribute("open");
  expect(draft).toHaveFocus();
  await act(async () => refresh.resolve(page([row(2, "Updated entry 2")], false)));
  expect(screen.getByText("Updated entry 2")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Draft 2" })).toBe(draft);
  expect(draft).toHaveValue("Unsaved notes");
  expect(draft).toHaveFocus();
  expect(details).toHaveAttribute("open");
});

it("rebuilds every loaded page using fresh cursors and removes revoked rows and metadata", async () => {
  const fetchPage = vi
    .fn<FetchPage>()
    .mockResolvedValueOnce(page([row(2)], true, { private: "Private area" }))
    .mockResolvedValueOnce(page([row(3)], false));
  const { result, rerender } = renderHook(({ initial }) => useList(initial, fetchPage), {
    initialProps: { initial: page([row(1)]) },
  });
  await act(() => result.current.loadMore());
  await act(() => result.current.loadMore());
  expect(result.current.items).toEqual([row(1), row(2), row(3)]);
  fetchPage
    .mockResolvedValueOnce(page([row(1)], true, { public: "Public area" }))
    .mockResolvedValueOnce(page([row(3, "Now shared without notes")], false));
  rerender({ initial: page([row(4)]) });
  await waitFor(() =>
    expect(result.current.items).toEqual([row(4), row(1), row(3, "Now shared without notes")]),
  );
  expect(
    fetchPage.mock.calls.slice(2).map(([offset, index, last]) => [offset, index, last?.id]),
  ).toEqual([
    [1, 2, 4],
    [2, 3, 1],
  ]);
  expect(result.current.meta).toEqual({ public: "Public area" });
  expect(result.current.hasMore).toBe(false);
});

it("drops unverified tail pages if revalidation fails, and allows loading them again", async () => {
  const refresh = deferred<Page>();
  const fetchPage = vi
    .fn<FetchPage>()
    .mockResolvedValueOnce(page([row(2)], false))
    .mockReturnValueOnce(refresh.promise)
    .mockResolvedValueOnce(page([row(3)], false));
  const { result, rerender } = renderHook(({ initial }) => useList(initial, fetchPage), {
    initialProps: { initial: page([row(1)]) },
  });
  await act(() => result.current.loadMore());
  rerender({ initial: page([row(1, "Updated first page")]) });
  expect(result.current.items).toHaveLength(2);
  expect(result.current.loadingMore).toBe(true);
  await act(() => result.current.loadMore());
  expect(fetchPage).toHaveBeenCalledTimes(2);
  await act(async () => refresh.reject(new Error("Access changed or offline")));
  expect(result.current.items).toEqual([row(1, "Updated first page")]);
  expect(result.current.hasMore).toBe(true);
  await act(() => result.current.loadMore());
  expect(result.current.items).toEqual([row(1, "Updated first page"), row(3)]);
});

it("ignores superseded revalidation and aborts its transport", async () => {
  const old = deferred<Page>();
  const latest = deferred<Page>();
  const fetchPage = vi
    .fn<FetchPage>()
    .mockResolvedValueOnce(page([row(2)], false))
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(latest.promise);
  const { result, rerender, unmount } = renderHook(({ initial }) => useList(initial, fetchPage), {
    initialProps: { initial: page([row(1)]) },
  });
  await act(() => result.current.loadMore());
  rerender({ initial: page([row(3)]) });
  await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
  rerender({ initial: page([row(4)]) });
  await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(3));
  expect(fetchPage.mock.calls[1][3]?.aborted).toBe(true);
  await act(async () => latest.resolve(page([row(5)], false)));
  await act(async () => old.resolve(page([row(99)], false)));
  expect(result.current.items).toEqual([row(4), row(5)]);
  unmount();
  expect(fetchPage.mock.calls[2][3]?.aborted).toBe(true);
});

it("cancels an old load-more response when the server supplies a replacement snapshot", async () => {
  const old = deferred<Page>();
  const fetchPage = vi.fn<FetchPage>().mockReturnValueOnce(old.promise);
  const { result, rerender } = renderHook(({ initial }) => useList(initial, fetchPage), {
    initialProps: { initial: page([row(1)]) },
  });
  let loading!: Promise<void>;
  act(() => {
    loading = result.current.loadMore();
  });
  rerender({ initial: page([row(3)], false) });
  expect(fetchPage.mock.calls[0][3]?.aborted).toBe(true);
  await act(async () => {
    old.resolve(page([row(2)], false));
    await loading;
  });
  expect(result.current.items).toEqual([row(3)]);
  expect(result.current.loadingMore).toBe(false);
});
