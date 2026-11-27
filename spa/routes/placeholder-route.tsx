import Link from "@/spa/shims/next-link";
import { usePathname } from "@/spa/shims/next-navigation";

export default function PlaceholderRoute() {
  const pathname = usePathname();
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h1 className="font-display text-2xl font-bold">Route pending migration</h1>
      <p className="mt-2 text-sm text-muted">
        <code className="rounded bg-surface-secondary px-1.5 py-0.5">{pathname}</code> is scheduled
        to move onto the Vite + React Router SPA in Stacks 2–5.
      </p>
      <p className="mt-4">
        <Link href="/" className="link text-sm font-medium">
          Return to catalog search
        </Link>
      </p>
    </section>
  );
}
