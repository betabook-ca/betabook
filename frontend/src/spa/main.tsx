import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

// oxlint-disable-next-line import/no-unassigned-import -- load base Tailwind and HeroUI design tokens
import "@/spa/globals.css";
// oxlint-disable-next-line import/no-unassigned-import -- load self-hosted Geist and Barlow Condensed faces
import "@/spa/fonts.css";
import { App } from "@/spa/app";

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}
