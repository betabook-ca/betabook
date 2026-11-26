import { isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";

import NewAreaPage from "@/app/areas/new/page";
import NewClimbPage from "@/app/climbs/new/page";
import { AddKindNav } from "@/components/add-kind-nav";
import { NewAreaForm } from "@/components/new-area-form";
import { NewClimbForm } from "@/components/new-climb-form";

vi.mock("@/lib/session", () => ({
  getMemberSession: async () => ({ user: { id: "member" } }),
}));

function findAll(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type));
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  const own = node.type === type ? [node as ReactElement<Record<string, unknown>>] : [];
  return [...own, ...findAll(node.props.children, type)];
}

it("offers the area form beside the climb form on the climb page", async () => {
  const page = await NewClimbPage({ searchParams: Promise.resolve({ name: "Moss Ladder" }) });

  expect(findAll(page, AddKindNav).map((nav) => nav.props.current)).toEqual(["climb"]);
  expect(findAll(page, NewClimbForm)[0]?.props.initial).toMatchObject({ name: "Moss Ladder" });
});

it("offers the climb form beside the area form on the area page", async () => {
  const page = await NewAreaPage();

  expect(findAll(page, AddKindNav).map((nav) => nav.props.current)).toEqual(["area"]);
  expect(findAll(page, NewAreaForm)).toHaveLength(1);
});
