import type { ActionResult } from "@/lib/action-result";
import type { paths } from "@/spa/generated/api";

type ActionPath = Extract<keyof paths, `/api/actions/${string}`>;
type NameOf<P extends ActionPath> = P extends `/api/actions/${infer Name}` ? Name : never;
export type ActionName = NameOf<ActionPath>;
type Operation<Name extends ActionName> = paths[`/api/actions/${Name}`]["post"];
type WireArgs<Name extends ActionName> = Operation<Name>["requestBody"]["content"] extends {
  "application/json": { args: infer Args extends unknown[] };
}
  ? Args
  : [FormData];

// The Rust API represents ordinary form values as ordered string pairs. The
// browser takes FormData directly so callers can append repeated values.
type BrowserArgs<Args extends unknown[]> = Args extends never[]
  ? []
  : {
      [K in keyof Args]: Args[K] extends { __formData: [string, string][] } ? FormData : Args[K];
    };
export type ActionArgs<Name extends ActionName> = BrowserArgs<WireArgs<Name>>;
type WireResult<Name extends ActionName> =
  Operation<Name>["responses"][200]["content"]["application/json"];
type WithValue<R> = R extends { ok: true }
  ? R extends { value: unknown }
    ? R
    : R & Extract<ActionResult, { ok: true }>
  : R;
export type ClientResult<Name extends ActionName> = WithValue<WireResult<Name>>;
type ValueOf<Name extends ActionName> =
  Extract<WireResult<Name>, { ok: true }> extends { value: infer V } ? V : never;
export type SavedClimbList = ValueOf<"createClimbList">;
export type ReviewDecision = ValueOf<"approveChangeRequest">;
export type ClimbListItemChange = ValueOf<"addClimbToList">;
export type ImportResult = ValueOf<"importSends">;
