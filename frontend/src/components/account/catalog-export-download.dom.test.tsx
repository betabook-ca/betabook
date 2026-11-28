import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { CatalogExportDownload } from "./catalog-export-download";

it("links to the export with the snapshot date and counts", () => {
  render(
    <CatalogExportDownload
      info={{
        generatedAt: "2026-09-14T06:00:00.000Z",
        areaCount: 1200,
        climbCount: 1,
        size: 4096,
      }}
    />,
  );
  expect(
    screen.getByText("One JSON file. Updated Sep 14, 2026 · 1,200 areas · 1 climb."),
  ).toBeInTheDocument();
  const link = screen.getByRole("link", { name: "Download catalog" });
  expect(link).toHaveAttribute("href", "/api/catalog/export");
  expect(link).toHaveAttribute("download");
});

it("explains the empty state and offers no link before the first snapshot", () => {
  render(<CatalogExportDownload info={null} />);
  expect(screen.getByText(/The first snapshot runs on Monday/)).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
});
