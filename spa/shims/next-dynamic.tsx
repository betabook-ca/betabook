import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

type DynamicModule<P> = ComponentType<P> | { default: ComponentType<P> };

export type DynamicOptions = {
  ssr?: boolean;
  loading?: () => ReactNode;
};

/** `React.lazy` + `Suspense` compatibility shim for `next/dynamic`. */
export default function dynamic<P extends object>(
  loader: () => Promise<DynamicModule<P>>,
  options?: DynamicOptions,
): ComponentType<P> {
  const LazyComponent = lazy(async () => {
    const loaded = await loader();
    if (typeof loaded === "function") {
      return { default: loaded };
    }
    return { default: loaded.default };
  });

  const LoadingFallback = options?.loading;

  return function DynamicComponent(props: P) {
    return (
      <Suspense fallback={LoadingFallback ? <LoadingFallback /> : null}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
