import { vi } from "vitest";

// Components render next/link through AppLink, whose real implementation
// needs the app router. A test that needs something else mocks it again.
vi.mock("next/link", () => import("@/test/next-link"));
