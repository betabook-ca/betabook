"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

import { reportClientError } from "@/lib/client-error-report";

/** Last-resort boundary for errors thrown by the root layout itself — it
 * replaces the entire document, so it must render its own <html>/<body>
 * and can't rely on the app shell, fonts, or theme tokens. Deliberately
 * dependency-free inline styles for the same reason. The report is a plain
 * beacon, so it needs nothing from the shell either. */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError("global", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          fontFamily: "system-ui, sans-serif",
          background: "#eaf7ef",
          color: "#000",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Something went wrong</h1>
        <p style={{ margin: 0 }}>An unexpected error kept Betabook from loading.</p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            padding: "0.5rem 1rem",
            border: "1px solid #000",
            borderRadius: "0.5rem",
            background: "transparent",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
