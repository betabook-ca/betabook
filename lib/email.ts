import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Resend } from "resend";

import { getBaseUrl } from "@/lib/app-url";
import { renderEmail, type EmailTemplateOptions } from "@/lib/email-template";

const FROM = "Betabook <noreply@betabook.ca>";

// Cloudflare Email Routing forwards this to the maintainer's inbox, so the
// address here is the whole configuration — nothing to set per environment.
const CONTACT_TO = "hello@betabook.ca";

async function getResend() {
  const { env } = await getCloudflareContext({ async: true });
  return env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
}

async function deliverEmail({
  to,
  subject,
  replyTo,
  baseUrl,
  ...content
}: Omit<EmailTemplateOptions, "baseUrl"> & {
  to: string;
  subject: string;
  replyTo?: string;
  baseUrl?: string;
}) {
  const resend = await getResend();
  if (!resend) {
    const appUrl = new URL(await getBaseUrl());
    if (
      !["http:", "https:"].includes(appUrl.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(appUrl.hostname)
    ) {
      throw new Error("Email delivery is not configured");
    }
    console.log(
      `[dev] ${subject} to ${to}${replyTo ? `, reply to ${replyTo}` : ""}:\n${content.text}`,
    );
    return;
  }
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    ...(replyTo ? { replyTo } : {}),
    ...renderEmail({ ...content, baseUrl: baseUrl ?? (await getBaseUrl()) }),
  });
  if (error) throw new Error(`Resend rejected "${subject}": ${error.message}`);
}

export async function sendVerificationEmail(to: string, url: string) {
  return deliverEmail({
    to,
    subject: "Verify your Betabook email",
    title: "Verify your email",
    text: `Click the link below to verify your email address:\n\n${url}`,
    links: [{ href: url, label: "Verify email" }],
  });
}

export async function sendResetPasswordEmail(to: string, url: string) {
  return deliverEmail({
    to,
    subject: "Reset your Betabook password",
    title: "Reset your password",
    text: `Click the link below to reset your password:\n\n${url}`,
    links: [{ href: url, label: "Reset password" }],
  });
}

/** Sent once after verification; welcome-email.ts owns the delivery claim. */
export async function sendWelcomeEmail(to: string, name: string) {
  const base = await getBaseUrl();

  const text = [
    `Hi ${name},`,
    "Your email is verified — welcome to Betabook, a climbing logbook and crag database for keeping the routes you've climbed and the places you climbed them.",
    "Somewhere to start:",
    `Already logging sends somewhere else? Export a CSV and bring the whole history across.\n${base}/account/import`,
    // Browsing areas and climbs starts with the search on the home page.
    `Search for a climb and log your first send.\n${base}`,
    `Betabook is free, ad-free, and source available. Questions or corrections? Get in touch:\n${base}/contact`,
  ].join("\n\n");

  return deliverEmail({
    to,
    subject: "Welcome to Betabook",
    baseUrl: base,
    title: "Welcome to Betabook",
    text,
    showLinkUrls: false,
    links: [
      { href: `${base}/account/import`, label: "Import your sends" },
      { href: base, label: "Log your first send" },
      { href: `${base}/contact`, label: "Get in touch" },
    ],
  });
}

/** Names are escaped in HTML. The requests page requires sign-in and exposes no
 * journal content; it also works when the requester has a private profile. */
export async function sendFriendRequestEmail(to: string, requesterName: string) {
  const base = await getBaseUrl();
  const text = [
    `${requesterName} sent you a friend request on Betabook.`,
    "",
    "Accept or decline the request:",
    `${base}/friends?view=requests`,
  ].join("\n");

  return deliverEmail({
    to,
    subject: "New friend request on Betabook",
    baseUrl: base,
    title: "New friend request",
    text,
    links: [{ href: `${base}/friends?view=requests`, label: "View friend requests" }],
  });
}

/** A message from the public /contact form.
 *
 * Sent from noreply@ — the only DKIM-signed sender for betabook.ca — with
 * the visitor's address as Reply-To, so hitting reply in a mail client
 * addresses them rather than a mailbox nobody reads.
 *
 */
export async function sendContactEmail(opts: { replyTo: string; subject: string; text: string }) {
  return deliverEmail({
    to: CONTACT_TO,
    replyTo: opts.replyTo,
    subject: opts.subject,
    title: "New contact message",
    text: opts.text,
  });
}

/** Sent when an admin approves or rejects a change request — the requester's
 * only way to learn what happened, since the queue itself is admin-only.
 * Fired only on the final decision: intermediate coverage approvals on a
 * multi-area request aren't news the requester can act on.
 *
 * Names, details, and admin notes remain literal text in both formats. */
export async function sendChangeRequestDecisionEmail(
  to: string,
  opts: {
    name: string;
    summary: string;
    details: string[];
    decision: "approved" | "rejected";
    note?: string | null;
    href: string | null;
  },
) {
  const base = await getBaseUrl();

  const lines = [
    `Hi ${opts.name},`,
    "",
    `An admin has ${opts.decision} your request: ${opts.summary}`,
  ];
  if (opts.details.length > 0) lines.push("", ...opts.details.map((detail) => `- ${detail}`));
  if (opts.note) lines.push("", `Note from the admin: ${opts.note}`);
  if (opts.href) lines.push("", `${base}${opts.href}`);
  const text = lines.join("\n");

  return deliverEmail({
    to,
    subject: `Your change request was ${opts.decision}`,
    baseUrl: base,
    title: `Your change request was ${opts.decision}`,
    text,
    links: opts.href ? [{ href: `${base}${opts.href}`, label: "View in Betabook" }] : [],
  });
}
