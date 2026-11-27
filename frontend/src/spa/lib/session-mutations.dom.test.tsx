import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SESSION_REFRESH_EVENT } from "@/lib/api-client";

import {
  acceptTerms,
  removeProfilePhoto,
  setGradePreferences,
  updateDisplayName,
  uploadProfilePhoto,
} from "./actions-client";
import { createWorkerAuthClient } from "./worker-auth";

afterEach(() => vi.unstubAllGlobals());

function session(name: string) {
  return Response.json({ user: { id: "same-member", name }, session: { userId: "same-member" } });
}

const mutations = {
  terms: () => acceptTerms("current", true),
  name: () => updateDisplayName(new FormData()),
  grades: () => setGradePreferences({ boulder: "font", rope: "french" }),
  upload: () => uploadProfilePhoto(new FormData()),
  removal: () => removeProfilePhoto(),
};

it.each(Object.entries(mutations))(
  "refreshes session fields after %s even during an older check",
  async (_name, mutate) => {
    let finish!: (r: Response) => void;
    const get = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(session("Before"))
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce(session("Updated"));
    const client = createWorkerAuthClient(get);
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true })));
    function Subscriber() {
      return <span>{client.useSession().data?.user.name}</span>;
    }
    render(
      <>
        <Subscriber />
        <Subscriber />
      </>,
    );
    expect(await screen.findAllByText("Before")).toHaveLength(2);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(get).toHaveBeenCalledTimes(2);
    await act(async () => {
      await mutate();
    });
    expect(await screen.findAllByText("Updated")).toHaveLength(2);
    await act(async () => finish(session("Stale")));
    expect(screen.queryByText("Stale")).toBeNull();
    expect(get).toHaveBeenCalledTimes(3);
  },
);

it("stops listening when the final subscriber leaves, and never restores an abandoned session check", async () => {
  let finish!: (r: Response) => void;
  const get = vi
    .fn<typeof fetch>()
    .mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce(session("New viewer"))
    .mockResolvedValueOnce(session("Remote change"));
  const client = createWorkerAuthClient(get);
  function Subscriber() {
    return <span>{client.useSession().data?.user.name}</span>;
  }
  const first = render(<Subscriber />);
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  first.unmount();
  window.dispatchEvent(new Event(SESSION_REFRESH_EVENT));
  expect(get).toHaveBeenCalledTimes(1);
  render(<Subscriber />);
  expect(await screen.findByText("New viewer")).toBeVisible();
  await act(async () => finish(session("Previous viewer")));
  expect(screen.queryByText("Previous viewer")).toBeNull();
  await act(async () => {
    window.dispatchEvent(
      new StorageEvent("storage", { key: SESSION_REFRESH_EVENT, newValue: "profile-change" }),
    );
  });
  expect(await screen.findByText("Remote change")).toBeVisible();
  expect(get).toHaveBeenCalledTimes(3);
});
