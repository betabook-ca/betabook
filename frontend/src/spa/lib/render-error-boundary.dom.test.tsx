import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";

import { reportClientError } from "@/lib/client-error-report";

import { PageErrorBoundary, RenderErrorBoundary } from "./render-error-boundary";

vi.mock("@/lib/client-error-report", () => ({
  reportClientError: vi.fn<typeof reportClientError>(),
}));

beforeEach(() => {
  vi.mocked(reportClientError).mockClear();
});

// Leave the failure active until the test explicitly makes the component healthy.
// React may start the same failing render more than once before committing recovery.
function failingPage() {
  const error = new Error("Render failed");
  let failed = true;
  function Page() {
    if (failed) throw error;
    return <h1>Recovered page</h1>;
  }
  return {
    Page,
    error,
    recover: () => {
      failed = false;
    },
  };
}

it("retries a failed route in place and reports each committed failure once", async () => {
  const user = userEvent.setup();
  const { Page, error, recover } = failingPage();
  render(
    <StrictMode>
      <MemoryRouter>
        <header>Shell</header>
        <PageErrorBoundary>
          <Page />
        </PageErrorBoundary>
      </MemoryRouter>
    </StrictMode>,
    { onCaughtError: () => {} },
  );
  const shell = screen.getByRole("banner");
  expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
  expect(reportClientError).toHaveBeenCalledExactlyOnceWith("page", error);
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(reportClientError).toHaveBeenCalledTimes(2);
  recover();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.getByRole("heading", { name: "Recovered page" })).toBeVisible();
  expect(screen.getByRole("banner")).toBe(shell);
  expect(reportClientError).toHaveBeenCalledTimes(2);
});

it("recovers when shell navigation opens a different route", async () => {
  const { Page, error } = failingPage();
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <header>
        <Link to="/search">Open search</Link>
      </header>
      <PageErrorBoundary>
        <Routes>
          <Route path="/" element={<Page />} />
          <Route path="/search" element={<h1>Search climbs</h1>} />
        </Routes>
      </PageErrorBoundary>
    </MemoryRouter>,
    { onCaughtError: () => {} },
  );
  expect(screen.getByRole("link", { name: "Find climbs" })).toHaveAttribute("href", "/search");
  await user.click(screen.getByRole("link", { name: "Open search" }));
  expect(screen.getByRole("heading", { name: "Search climbs" })).toBeVisible();
  expect(reportClientError).toHaveBeenCalledExactlyOnceWith("page", error);
});

it("reveals global recovery above a pending public frame and retries without shell providers", async () => {
  const { Page, error, recover } = failingPage();
  const user = userEvent.setup();
  const frame = document.createElement("div");
  frame.id = "public-entry";
  document.body.appendChild(frame);
  render(
    <StrictMode>
      <RenderErrorBoundary scope="global">
        <Page />
      </RenderErrorBoundary>
    </StrictMode>,
    { onCaughtError: () => {} },
  );
  expect(frame).not.toBeInTheDocument();
  expect(screen.getByText("An unexpected error kept Betabook from loading.")).toBeVisible();
  expect(reportClientError).toHaveBeenCalledExactlyOnceWith("global", error);
  recover();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.getByRole("heading", { name: "Recovered page" })).toBeVisible();
  expect(reportClientError).toHaveBeenCalledTimes(1);
});
