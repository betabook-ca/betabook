import { createElement, isValidElement, Suspense, type ReactElement } from "react";

type Element = ReactElement<Record<string, unknown>>;

function isAsyncComponent(type: unknown): type is (props: unknown) => Promise<unknown> {
  return typeof type === "function" && type.constructor.name === "AsyncFunction";
}

/**
 * Resolves the async server components in an unrendered page tree, so a test
 * can read the data a page streams behind Suspense. Each async component is
 * replaced by what it returns and each Suspense boundary by its children.
 * Synchronous components, including client components, stay as elements,
 * so their props can be asserted on.
 */
export async function resolveServerTree(node: unknown): Promise<unknown> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServerTree));
  if (!isValidElement<Record<string, unknown>>(node)) return node;
  if (isAsyncComponent(node.type)) return resolveServerTree(await node.type(node.props));
  if (node.type === Suspense) return resolveServerTree(node.props.children);
  const entries = await Promise.all(
    Object.entries(node.props).map(async ([key, value]) => [key, await resolveServerTree(value)]),
  );
  return createElement((node as Element).type, { ...Object.fromEntries(entries), key: node.key });
}

/** Wraps a page so each call returns its tree with resolveServerTree applied. */
export function rendered<Props, Result>(
  page: (props: Props) => Promise<Result>,
): (props: Props) => Promise<Result> {
  return async (props) => (await resolveServerTree(await page(props))) as Result;
}
