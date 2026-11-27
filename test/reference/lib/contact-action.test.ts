import { beforeEach, describe, expect, it, vi } from "vitest";

import { GENERIC_ERROR_MESSAGE } from "@/lib/action-result";
import { HONEYPOT_FIELD, MIN_FILL_MS } from "@/lib/contact";
import { submitContactMessage } from "@/lib/contact-action";
import { sendContactEmail } from "@/lib/email";
import { allowContactSubmission } from "@/lib/rate-limit";

/** The action boundary must never throw — Next.js redacts uncaught
 * server-action errors in production, so these tests pin the structured
 * ActionResult contract, and the two gates a public endpoint depends on. */

const requestState = vi.hoisted(() => ({ ip: "203.0.113.7" as string | null }));

// The real next/headers needs a Next request; the client IP is the only
// thing this action reads from it.
vi.mock("next/headers", () => ({
  headers: async () => new Headers(requestState.ip ? { "cf-connecting-ip": requestState.ip } : {}),
}));

// Both of these reach for Worker bindings. Stub the decisions, not the
// bindings.
vi.mock("@/lib/rate-limit", () => ({
  allowContactSubmission: vi.fn<() => Promise<boolean>>(async () => true),
}));
vi.mock("@/lib/email", () => ({ sendContactEmail: vi.fn<() => Promise<void>>(async () => {}) }));

function contactFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const fields: Record<string, string> = {
    name: "Ada",
    email: "ada@example.com",
    message: "The grade on Squamish Buttress looks off.",
    [HONEYPOT_FIELD]: "",
    elapsed: String(MIN_FILL_MS + 1000),
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.mocked(allowContactSubmission).mockResolvedValue(true);
  vi.mocked(sendContactEmail).mockResolvedValue(undefined);
  requestState.ip = "203.0.113.7";
  vi.clearAllMocks();
});

describe("submitContactMessage", () => {
  it("sends the message with the visitor's address as Reply-To", async () => {
    const result = await submitContactMessage(contactFormData());

    expect(result).toEqual({ ok: true, value: undefined });
    expect(sendContactEmail).toHaveBeenCalledWith({
      replyTo: "ada@example.com",
      subject: "Betabook contact: Ada",
      text: expect.stringContaining("The grade on Squamish Buttress looks off."),
    });
  });

  it("keys the rate limiter on the client IP, never on the email", async () => {
    await submitContactMessage(contactFormData());
    expect(allowContactSubmission).toHaveBeenCalledWith("203.0.113.7");
  });

  it("shares one bucket when there's no client IP", async () => {
    requestState.ip = null;
    await submitContactMessage(contactFormData());
    expect(allowContactSubmission).toHaveBeenCalledWith("unknown");
  });

  it("reports success but sends nothing when the honeypot is filled", async () => {
    const result = await submitContactMessage(
      contactFormData({ [HONEYPOT_FIELD]: "https://spam.example" }),
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(sendContactEmail).not.toHaveBeenCalled();
    // Not even the rate limiter — a bot shouldn't get to burn a real
    // visitor's budget for the shared "unknown" bucket.
    expect(allowContactSubmission).not.toHaveBeenCalled();
  });

  it("reports success but sends nothing when the form was filled too fast", async () => {
    const result = await submitContactMessage(contactFormData({ elapsed: "12" }));

    expect(result).toEqual({ ok: true, value: undefined });
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it("refuses a throttled submission with a message the visitor can act on", async () => {
    vi.mocked(allowContactSubmission).mockResolvedValue(false);

    const result = await submitContactMessage(contactFormData());

    expect(result).toEqual({
      ok: false,
      error: "Too many messages from this network. Try again in a minute.",
    });
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it("surfaces a validation failure and doesn't reach the limiter", async () => {
    const result = await submitContactMessage(contactFormData({ email: "not-an-address" }));

    expect(result).toEqual({ ok: false, error: "Enter a valid email address" });
    expect(allowContactSubmission).not.toHaveBeenCalled();
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it("reports a failed send as a failure rather than a silent success", async () => {
    vi.mocked(sendContactEmail).mockRejectedValue(new Error("Resend is down"));

    // A plain Error, so the boundary swallows the detail — the visitor
    // learns the message didn't go, not what Resend said about it.
    expect(await submitContactMessage(contactFormData())).toEqual({
      ok: false,
      error: GENERIC_ERROR_MESSAGE,
    });
  });
});
