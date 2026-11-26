import { apiFetch } from "@/lib/api-client";
import type { paths } from "@/spa/generated/api";
import { fetchJson } from "@/spa/lib/fetch-json";

export type GetPath = {
  [P in keyof paths]: paths[P] extends {
    get: { responses: { 200: { content: { "application/json": unknown } } } };
  }
    ? P
    : never;
}[keyof paths];

export type ApiResponse<P extends GetPath> = paths[P] extends {
  get: { responses: { 200: { content: { "application/json": infer Body } } } };
}
  ? Body
  : never;

type GetOptions<P extends GetPath> = (paths[P] extends {
  get: { parameters: { path: infer Params extends Record<string, string | number> } };
}
  ? { path: Params }
  : { path?: never }) & {
  query?:
    | URLSearchParams
    | (paths[P] extends { get: { parameters: { query?: infer Q } } } ? Q : never);
  signal?: AbortSignal;
  sessionEvents?: boolean;
};

export function fetchApi<P extends GetPath>(
  template: P,
  options: GetOptions<P>,
): Promise<ApiResponse<P>> {
  const params: Record<string, string | number> = options.path ?? {};
  const pathname = String(template).replace(/\{([^}]+)\}/g, (_, name: string) => {
    if (!Object.hasOwn(params, name)) throw new Error(`Missing URL parameter: ${name}`);
    return encodeURIComponent(String(params[name]));
  });
  const query = options.query instanceof URLSearchParams ? options.query : new URLSearchParams();
  if (options.query && !(options.query instanceof URLSearchParams)) {
    for (const [key, value] of Object.entries(options.query)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== undefined && item !== null) query.append(key, String(item));
      }
    }
  }
  const suffix = query.toString();
  return fetchJson<ApiResponse<P>>(
    pathname + (suffix ? `?${suffix}` : ""),
    {
      signal: options.signal,
    },
    options.sessionEvents ? apiFetch : fetch,
  );
}
