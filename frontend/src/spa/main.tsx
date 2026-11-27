import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

// oxlint-disable-next-line import/no-unassigned-import -- load base Tailwind and HeroUI design tokens
import "@/spa/globals.css";
// oxlint-disable-next-line import/no-unassigned-import -- load the self-hosted body font and shared type families
import "@/spa/fonts.css";
import { App } from "@/spa/app";
import { RenderErrorBoundary } from "@/spa/lib/render-error-boundary";

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <RenderErrorBoundary scope="global">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </RenderErrorBoundary>
    </StrictMode>,
  );
}
