"use client";

import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { useEffect, useRef, useState, useTransition } from "react";

import { SURFACE_CARD_CLASS } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useClientSession } from "@/hooks/use-client-session";
import {
  HONEYPOT_FIELD,
  MAX_EMAIL_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
} from "@/lib/contact";
import { submitContactMessage } from "@/lib/contact-action";

export function ContactForm() {
  // Mount time, not first keystroke — the server rejects anything submitted
  // within MIN_FILL_MS of the page appearing. A ref, not state: nothing
  // renders from it, and it must survive re-renders without resetting.
  // Stamped in an effect because Date.now() is impure and can't be called
  // during render. The effect runs before the page is interactive, so by the
  // time a submit is possible this is always set.
  const mountedAt = useRef<number | null>(null);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const sessionUser = useClientSession()?.user;

  // null means "the visitor hasn't touched this yet", so the session can
  // fill in behind it whenever it resolves and the first keystroke pins the
  // field for good. No effect, so no flash and no ordering to get wrong.
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState<string | null>(null);
  const name = nameInput ?? sessionUser?.name ?? "";
  const email = emailInput ?? sessionUser?.email ?? "";

  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("email", email.trim());
    formData.set("message", message.trim());
    formData.set(HONEYPOT_FIELD, honeypot);
    formData.set(
      "elapsed",
      String(mountedAt.current === null ? 0 : Date.now() - mountedAt.current),
    );

    startTransition(async () => {
      const result = await submitContactMessage(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(email.trim());
    });
  }

  if (sent) {
    return (
      <InlineAlert status="success" title="Message sent">
        Thanks — that&apos;s landed. Any reply will come back to {sent}.
      </InlineAlert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={SURFACE_CARD_CLASS}>
      <TextField value={name} onChange={setNameInput} maxLength={MAX_NAME_LENGTH}>
        <Label>Name (optional)</Label>
        <Input className="bg-surface" />
      </TextField>

      <TextField
        value={email}
        onChange={setEmailInput}
        type="email"
        isRequired
        maxLength={MAX_EMAIL_LENGTH}
      >
        <Label>Email</Label>
        <Input placeholder="you@example.com" className="bg-surface" />
      </TextField>

      <TextField value={message} onChange={setMessage} isRequired maxLength={MAX_MESSAGE_LENGTH}>
        <Label>Message</Label>
        <TextArea placeholder="What's on your mind?" className="bg-surface" rows={8} />
      </TextField>

      {/* Honeypot. Off-screen rather than `hidden` or display:none — those
       * are exactly what a form-filler checks for. aria-hidden and
       * tabIndex=-1 keep it out of the accessibility tree and the tab
       * order, so no real visitor can reach it; anything that fills it is
       * filling every input on the page. Raw input, not a HeroUI
       * TextField, so nothing themed has to be hidden back out again. */}
      <input
        type="text"
        name={HONEYPOT_FIELD}
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-px w-px opacity-0"
      />

      {error && <InlineAlert>{error}</InlineAlert>}

      <Button type="submit" isDisabled={pending || !email.trim() || !message.trim()} fullWidth>
        Send Message
      </Button>
    </form>
  );
}
