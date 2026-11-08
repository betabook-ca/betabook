import { afterAll, vi } from "vitest";

// Components render next/link through AppLink, whose real implementation
// needs the app router. A test that needs something else mocks it again.
vi.mock("next/link", () => import("@/test/next-link"));

// With `isolate: false`, Vitest clears `vi.mock` registrations and suite hooks
// after each test file without resetting `evaluatedModules`. Resetting setup
// and application modules (plus mocked packages) after each file ensures setup
// files re-run and per-file `vi.mock` bindings take effect while keeping heavy
// third-party packages (`react`, `@heroui/*`, `drizzle-orm`, etc.) evaluated.
interface VitestEvaluatedModules {
  idToModuleMap: Map<
    string,
    { promise: unknown; exports: unknown; evaluated: boolean; importers: Set<unknown> }
  >;
}

afterAll(() => {
  const workerState = Reflect.get(globalThis, "__vitest_worker__") as
    | { evaluatedModules?: VitestEvaluatedModules }
    | undefined;
  if (!workerState?.evaluatedModules) return;
  for (const [id, node] of workerState.evaluatedModules.idToModuleMap) {
    if (
      !id.includes("/node_modules/") ||
      id.includes("/node_modules/next/") ||
      id.includes("/node_modules/resend/") ||
      id.includes("/node_modules/react-easy-crop/") ||
      id.startsWith("mock:")
    ) {
      node.promise = undefined;
      node.exports = undefined;
      node.evaluated = false;
      node.importers.clear();
    }
  }
});
