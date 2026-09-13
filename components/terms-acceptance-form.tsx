"use client";

import { Button, Checkbox, Modal } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { acceptTerms } from "@/actions/terms";
import { SignOutButton } from "@/components/sign-out-button";
import { AppLink } from "@/components/ui/app-link";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { ActionResult } from "@/lib/action-result";
import { termsHref } from "@/lib/terms";
import { termsNextPath } from "@/lib/terms-navigation";

export function TermsAcceptanceForm({
  version,
  versionLabel,
  previousVersion,
  next,
  onAccept = acceptTerms,
  onSignOut,
  onAccepted,
}: {
  version: string;
  versionLabel: string;
  previousVersion: string | null;
  next?: string;
  onAccept?: (version: unknown, agreed: unknown) => Promise<ActionResult>;
  onSignOut?: () => void;
  onAccepted?: () => void;
}) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!agreed || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await onAccept(version, agreed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (onAccepted) onAccepted();
      else {
        router.replace(termsNextPath(next));
        router.refresh();
      }
    } catch {
      setError("Could not save your agreement. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal.Backdrop isOpen isDismissable={false} isKeyboardDismissDisabled className="bg-black/20">
      <Modal.Container placement="center" size="sm">
        <Modal.Dialog aria-label="Terms of Service">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Modal.Header>
              <Modal.Heading level={1}>Terms of Service</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                {previousVersion
                  ? "The terms have been updated since your last agreement."
                  : "Please review and accept our terms to continue."}
              </p>
              <AppLink
                href={termsHref(version)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline"
              >
                Read the Terms of Service
              </AppLink>
              <Checkbox isSelected={agreed} onChange={setAgreed} isDisabled={pending} isRequired>
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  I agree to these Terms of Service
                </Checkbox.Content>
              </Checkbox>
              <p className="text-xs text-muted">
                Updated {versionLabel}
                {" · "}
                <AppLink href="/contact" className="inline underline">
                  Contact us
                </AppLink>
              </p>
              {error && <InlineAlert>{error}</InlineAlert>}
            </Modal.Body>
            <Modal.Footer className="flex flex-wrap items-center justify-between gap-2">
              <SignOutButton onSignOut={onSignOut} compact />
              <Button type="submit" isDisabled={!agreed || pending}>
                {pending ? "Saving agreement…" : "Accept and continue"}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
