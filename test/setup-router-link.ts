import { vi } from "vitest";

// Components render RouterLink through AppLink, whose real implementation
// needs the app router. A test that needs something else mocks it again.
vi.mock("@/spa/lib/router-link", () => import("@/test/router-link"));
