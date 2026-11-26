import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";

import { useMounted } from "./use-mounted";

function Probe({ renders }: { renders: boolean[] }) {
  const mounted = useMounted();
  renders.push(mounted);
  return <p>{mounted ? "client" : "server"}</p>;
}

it("renders a component mounted after hydration as mounted from its first render", () => {
  const renders: boolean[] = [];
  render(<Probe renders={renders} />);
  // A loading state mounted by a navigation must not draw its
  // server-shaped fallback for a frame first.
  expect(renders[0]).toBe(true);
});

it("keeps hydration's first render identical to the server's", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Probe renders={[]} />);
  document.body.appendChild(container);
  const renders: boolean[] = [];
  const view = render(<Probe renders={renders} />, { container, hydrate: true });

  expect(renders[0]).toBe(false);
  expect(view.getByText("client")).toBeInTheDocument();
});
