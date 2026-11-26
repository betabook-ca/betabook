import { Button, Input, Label, TextField } from "@heroui/react";
import { useState } from "react";

import { fetchJson, type AuthSession } from "@/spa/lib/fetch-json";
import Link from "@/spa/shims/next-link";
import { useRouter } from "@/spa/shims/next-navigation";

export default function SignInRoute({
  session,
  onSessionChange,
}: {
  session: AuthSession;
  onSessionChange: () => Promise<void>;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await fetchJson("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      await onSessionChange();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await fetchJson("/api/auth/sign-out", { method: "POST" });
    await onSessionChange();
  };

  if (session) {
    return (
      <section className="mx-auto max-w-md rounded-xl border border-border bg-surface p-6">
        <h1 className="font-display text-2xl font-bold">Signed in as {session.user.name}</h1>
        <p className="mt-1 text-sm text-muted">{session.user.email}</p>
        <div className="mt-4 flex gap-3">
          <Button
            variant="secondary"
            onPress={() => {
              void handleSignOut();
            }}
          >
            Sign out
          </Button>
          <Link href="/" className="link self-center text-sm">
            Back to catalog
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-md rounded-xl border border-border bg-surface p-6">
      <h1 className="font-display text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Authenticates directly against Rust `/api/auth`.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        className="mt-5 flex flex-col gap-4"
      >
        <TextField type="email" value={email} onChange={setEmail} isRequired>
          <Label>Email</Label>
          <Input autoComplete="email" placeholder="dev@example.com" />
        </TextField>
        <TextField type="password" value={password} onChange={setPassword} isRequired>
          <Label>Password</Label>
          <Input autoComplete="current-password" />
        </TextField>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" isDisabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </section>
  );
}
