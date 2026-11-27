import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import Link from "@/spa/shims/next-link";
import { useParams, usePathname, useRouter, useSearchParams } from "@/spa/shims/next-navigation";

function Inspector({
  onPreventedNavigate,
}: {
  onPreventedNavigate?: (cancelled: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ id?: string }>();

  return (
    <div>
      <p data-testid="pathname">{pathname}</p>
      <p data-testid="query">{searchParams.get("tab") ?? "none"}</p>
      <p data-testid="param-id">{params.id ?? "none"}</p>
      <button type="button" onClick={() => router.push("/areas/42?tab=climbs")}>
        Push area
      </button>
      <button type="button" onClick={() => router.replace("/climbs/7?tab=sends")}>
        Replace climb
      </button>
      <button type="button" onClick={() => router.back()}>
        Go back
      </button>
      <Link href={{ pathname: "/areas/9", query: { tab: "info" } }}>Object link</Link>
      <Link
        href="/should-cancel"
        onNavigate={(event) => {
          event.preventDefault();
          onPreventedNavigate?.(true);
        }}
      >
        Cancelled link
      </Link>
    </div>
  );
}

describe("SPA next/* navigation shims", () => {
  it("maps usePathname, useSearchParams, useParams, useRouter, and Link onto react-router", async () => {
    const user = userEvent.setup();
    const cancelledSpy = vi.fn<(cancelled: boolean) => void>();

    render(
      <MemoryRouter initialEntries={["/areas/12?tab=overview"]}>
        <Routes>
          <Route path="/areas/:id" element={<Inspector onPreventedNavigate={cancelledSpy} />} />
          <Route path="/climbs/:id" element={<Inspector onPreventedNavigate={cancelledSpy} />} />
          <Route path="/should-cancel" element={<Inspector onPreventedNavigate={cancelledSpy} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("pathname")).toHaveTextContent("/areas/12");
    expect(screen.getByTestId("query")).toHaveTextContent("overview");
    expect(screen.getByTestId("param-id")).toHaveTextContent("12");

    await user.click(screen.getByRole("button", { name: "Push area" }));
    expect(screen.getByTestId("pathname")).toHaveTextContent("/areas/42");
    expect(screen.getByTestId("query")).toHaveTextContent("climbs");
    expect(screen.getByTestId("param-id")).toHaveTextContent("42");

    await user.click(screen.getByRole("link", { name: "Object link" }));
    expect(screen.getByTestId("pathname")).toHaveTextContent("/areas/9");
    expect(screen.getByTestId("query")).toHaveTextContent("info");
    expect(screen.getByTestId("param-id")).toHaveTextContent("9");

    await user.click(screen.getByRole("button", { name: "Go back" }));
    expect(screen.getByTestId("pathname")).toHaveTextContent("/areas/42");

    await user.click(screen.getByRole("link", { name: "Cancelled link" }));
    expect(cancelledSpy).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("pathname")).toHaveTextContent("/areas/42");

    await user.click(screen.getByRole("button", { name: "Replace climb" }));
    expect(screen.getByTestId("pathname")).toHaveTextContent("/climbs/7");
    expect(screen.getByTestId("query")).toHaveTextContent("sends");
    expect(screen.getByTestId("param-id")).toHaveTextContent("7");
  });
});
