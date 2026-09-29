import { createRequestContext, runWithRequestContext } from "vinext/shims/unified-request-context";
import { expect, it, vi } from "vitest";

import { requestMemo } from "@/lib/request-memo";

type Row = { id: number | string };
type Load = (id: number) => Promise<Row>;

// The scope vinext opens around every request, metadata and page alike.
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(createRequestContext(), fn);

it("reads once per request for the same arguments, however many callers", async () => {
  const load = vi.fn<(id: number, viewer: string) => Promise<{ id: number; viewer: string }>>(
    async (id, viewer) => ({ id, viewer }),
  );
  const memo = requestMemo(load);

  const [first, second, other, otherViewer] = await inRequest(() =>
    Promise.all([memo(1, "a"), memo(1, "a"), memo(2, "a"), memo(1, "b")]),
  );

  expect(load.mock.calls).toEqual([
    [1, "a"],
    [2, "a"],
    [1, "b"],
  ]);
  expect(first).toBe(second);
  expect(other).toEqual({ id: 2, viewer: "a" });
  expect(otherViewer).toEqual({ id: 1, viewer: "b" });
});

it("does not carry a read into the next request", async () => {
  const load = vi.fn<Load>(async (id) => ({ id }));
  const memo = requestMemo(load);

  const first = await inRequest(() => memo(1));
  const second = await inRequest(() => memo(1));

  expect(load).toHaveBeenCalledTimes(2);
  expect(first).not.toBe(second);
});

it("tells a number from its string, and one loader from another", async () => {
  const load = vi.fn<(id: number | string) => Promise<Row>>(async (id) => ({ id }));
  const twin = vi.fn<(id: number | string) => Promise<{ twin: number | string }>>(async (id) => ({
    twin: id,
  }));
  const memo = requestMemo(load);
  const memoTwin = requestMemo(twin);

  await inRequest(() => Promise.all([memo(1), memo("1"), memoTwin(1)]));

  expect(load).toHaveBeenCalledTimes(2);
  expect(twin).toHaveBeenCalledTimes(1);
});

it("keeps argument boundaries apart, whatever the strings contain", async () => {
  const load = vi.fn<(...parts: string[]) => Promise<string>>(async (...parts) => parts.join("|"));
  const memo = requestMemo(load);
  const nullish = vi.fn<(id: string | null | undefined) => Promise<string>>(async (id) =>
    String(id),
  );
  const memoNullish = requestMemo(nullish);

  const [joined, split] = await inRequest(() =>
    Promise.all([
      memo("a\u0000string:b"),
      memo("a", "b"),
      memoNullish(null),
      memoNullish(undefined),
      memoNullish("null"),
    ]),
  );

  expect(load).toHaveBeenCalledTimes(2);
  expect([joined, split]).toEqual(["a\u0000string:b", "a|b"]);
  expect(nullish).toHaveBeenCalledTimes(3);
});

it("retries after a failed read instead of replaying the failure", async () => {
  const load = vi
    .fn<Load>()
    .mockRejectedValueOnce(new Error("D1 hiccup"))
    .mockResolvedValue({ id: 1 });
  const memo = requestMemo(load);

  await inRequest(async () => {
    await expect(memo(1)).rejects.toThrow("D1 hiccup");
    await expect(memo(1)).resolves.toEqual({ id: 1 });
  });

  expect(load).toHaveBeenCalledTimes(2);
});

it("runs every call outside a request, where there is nothing to share", async () => {
  const load = vi.fn<Load>(async (id) => ({ id }));
  const memo = requestMemo(load);

  await Promise.all([memo(1), memo(1)]);

  expect(load).toHaveBeenCalledTimes(2);
});
