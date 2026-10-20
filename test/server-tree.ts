import { createElement, isValidElement, Suspense, type ReactElement } from "react";

type Element = ReactElement<Record<string, unknown>>;

type Options = {
  /** Synchronous server components to call. Client components are plain
   * functions in the Workers tests, so a synchronous component is called only
   * when it is listed here; one that renders async sections, such as
   * ProfileHeader, needs to be listed for those sections to resolve. */
  expand?: readonly unknown[];
};

function isAsyncComponent(type: unknown): boolean {
  return typeof type === "function" && type.constructor.name === "AsyncFunction";
}

/**
 * Resolves the server components in an unrendered page tree, so a test can
 * read the data a page streams behind Suspense. Each async component, and each
 * component listed in `expand`, is replaced by what it returns, and each
 * Suspense boundary by its children. Other components, including client
 * components, stay as elements, so their props can be asserted on.
 */
export async function resolveServerTree(node: unknown, options: Options = {}): Promise<unknown> {
  const resolve = (child: unknown) => resolveServerTree(child, options);
  if (Array.isArray(node)) return Promise.all(node.map(resolve));
  if (!isValidElement<Record<string, unknown>>(node)) return node;
  if (isAsyncComponent(node.type) || options.expand?.includes(node.type)) {
    const render = node.type as (props: Record<string, unknown>) => unknown;
    return resolve(await render(node.props));
  }
  if (node.type === Suspense) return resolve(node.props.children);
  const entries = await Promise.all(
    Object.entries(node.props).map(async ([key, value]) => [key, await resolve(value)]),
  );
  const props = Object.fromEntries(entries);
  return createElement(
    (node as Element).type,
    node.key == null ? props : { ...props, key: node.key },
  );
}

/** Wraps a page so each call returns its tree with resolveServerTree applied. */
export function rendered<Props, Result>(
  page: (props: Props) => Promise<Result>,
  options?: Options,
): (props: Props) => Promise<Result> {
  return async (props) => (await resolveServerTree(await page(props), options)) as Result;
}

type TreeElement = { type: unknown; key: unknown; props: Record<string, unknown> };

/** Every element in a resolved tree, depth first, including elements passed as
 * props. */
export function treeElements(node: unknown): TreeElement[] {
  const found: TreeElement[] = [];
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) stack.push(...current);
    else if (current && typeof current === "object" && "props" in current) {
      const element = current as TreeElement;
      found.push(element);
      stack.push(...Object.values(element.props ?? {}));
    }
  }
  return found;
}

/** The synchronous server components between a trip page and its client
 * components. Matched by name, since some aren't exported. */
const TRIP_LAYERS = new Set(["TripHeader", "TripDays", "TripDayCards", "JournalEntryRow"]);

/** Expands a resolved trip page down to its client components and day rows, so
 * a test can read their props and keys. */
export async function expandTripLayers(tree: unknown): Promise<unknown> {
  const types = treeElements(tree)
    .map((element) => element.type)
    .filter((type) => typeof type === "function" && TRIP_LAYERS.has(type.name));
  return types.length === 0
    ? tree
    : expandTripLayers(await resolveServerTree(tree, { expand: types }));
}
