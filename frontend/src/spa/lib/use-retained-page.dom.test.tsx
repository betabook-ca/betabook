import { act, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { useRetainedPage } from "./use-retained-page";

let scopes = 0;
function uniqueScope() {
  scopes += 1;
  return `scope-${scopes}`;
}

function Page({ scope, load }: { scope: string; load: (signal: AbortSignal) => Promise<string> }) {
  const page = useRetainedPage({ resource: "test-page", scope, query: "", load });
  if (!page.data) return <p>Loading</p>;
  return <p data-pending={page.pending}>{page.data}</p>;
}

it("shows a revisited page's last result at once and refreshes it quietly", async () => {
  const scope = uniqueScope();
  const load = vi.fn<(signal: AbortSignal) => Promise<string>>().mockResolvedValue("first");
  const first = render(<Page scope={scope} load={load} />);
  expect(await screen.findByText("first")).toBeInTheDocument();
  first.unmount();

  let finish: (value: string) => void = () => {};
  load.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<Page scope={scope} load={load} />);
  expect(screen.getByText("first")).toHaveAttribute("data-pending", "false");
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => finish("second"));
  expect(await screen.findByText("second")).toBeInTheDocument();
});

it("marks a revisited page pending when something changed since it loaded", async () => {
  const scope = uniqueScope();
  const load = vi.fn<(signal: AbortSignal) => Promise<string>>().mockResolvedValue("before");
  const first = render(<Page scope={scope} load={load} />);
  expect(await screen.findByText("before")).toBeInTheDocument();
  first.unmount();

  window.dispatchEvent(new CustomEvent("betabook:router-refresh"));
  load.mockResolvedValue("after");
  render(<Page scope={scope} load={load} />);
  expect(screen.getByText("before")).toHaveAttribute("data-pending", "true");
  await waitFor(() => expect(screen.getByText("after")).toHaveAttribute("data-pending", "false"));
});

it("never shows one scope's result for another", async () => {
  const load = vi.fn<(signal: AbortSignal) => Promise<string>>().mockResolvedValue("mine");
  const first = render(<Page scope={uniqueScope()} load={load} />);
  expect(await screen.findByText("mine")).toBeInTheDocument();
  first.unmount();

  load.mockReturnValue(new Promise(() => {}));
  render(<Page scope={uniqueScope()} load={load} />);
  expect(screen.getByText("Loading")).toBeInTheDocument();
});
