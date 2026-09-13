import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Resend } from "resend";

import { getBaseUrl } from "@/lib/app-url";
import { renderEmail } from "@/lib/email-template";

const FROM = "Betabook <noreply@betabook.ca>";

// Cloudflare Email Routing forwards this to the maintainer's inbox, so the
// address here is the whole configuration — nothing to set per environment.
const CONTACT_TO = "hello@betabook.ca";

async function getResend() {
  const { env } = await getCloudflareContext({ async: true });
  return env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
}

export async function sendVerificationEmail(to: string, url: string) {
  const resend = await getResend();
  if (!resend) {
    console.log(`[dev] verification link for ${to}: ${url}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Verify your Betabook email",
    ...renderEmail({
      baseUrl: await getBaseUrl(),
      title: "Verify your email",
      text: `Click the link below to verify your email address:

${url}`,
      links: [{ href: url, label: "Verify email" }],
    }),
  });
}

export async function sendResetPasswordEmail(to: string, url: string) {
  const resend = await getResend();
  if (!resend) {
    console.log(`[dev] reset password link for ${to}: ${url}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your Betabook password",
    ...renderEmail({
      baseUrl: await getBaseUrl(),
      title: "Reset your password",
      text: `Click the link below to reset your password:

${url}`,
      links: [{ href: url, label: "Reset password" }],
    }),
  });
}

/** Sent once, when an account's email verification lands.
 *
 * Verification is the moment the account becomes usable — every signed-in
 * surface is behind `requireEmailVerification` — and better-auth drops the
 * user back on /sign-in with no orientation. This is that orientation.
 *
 * Like sendContactEmail and unlike the two helpers above, this surfaces a
 * Resend failure rather than swallowing it: there is no "resend welcome"
 * button anywhere, so the caller is the only thing that can notice. See
 * lib/welcome-email.ts for what it does with that.
 */
export async function sendWelcomeEmail(to: string, name: string) {
  const resend = await getResend();
  const base = await getBaseUrl();

  const text = [
    `Hi ${name},`,
    "Your email is verified — welcome to Betabook, a climbing logbook and crag database for keeping the routes you've climbed and the places you climbed them.",
    "Somewhere to start:",
    `Already tracking sends somewhere else? Export a CSV and bring the whole history across.\n${base}/account/import`,
    // Browsing areas and climbs starts with the search on the home page.
    `Search for a climb and record your first ascent.\n${base}`,
    `Betabook is free, ad-free, and source available. Questions or corrections? Get in touch:\n${base}/contact`,
  ].join("\n\n");

  if (!resend) {
    console.log(`[dev] welcome email for ${to}:\n${text}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Welcome to Betabook",
    ...renderEmail({
      baseUrl: base,
      title: "Welcome to Betabook",
      text,
      showLinkUrls: false,
      links: [
        { href: `${base}/account/import`, label: "Import your logbook" },
        { href: base, label: "Log your first send" },
        { href: `${base}/contact`, label: "Get in touch" },
      ],
    }),
  });

  if (error) throw new Error(`Resend rejected the welcome email: ${error.message}`);
}

/** Names are escaped in HTML. The requests page requires sign-in and exposes no
 * journal content; it also works when the requester has a private profile. */
export async function sendFriendRequestEmail(to: string, requesterName: string) {
  const resend = await getResend();
  const base = await getBaseUrl();
  const text = [
    `${requesterName} sent you a friend request on Betabook.`,
    "",
    "Accept or decline the request:",
    `${base}/friends?view=requests`,
  ].join("\n");

  if (!resend) {
    console.log(`[dev] friend request email for ${to}:\n${text}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "New friend request on Betabook",
    ...renderEmail({
      baseUrl: base,
      title: "New friend request",
      text,
      links: [{ href: `${base}/friends?view=requests`, label: "View friend requests" }],
    }),
  });
  if (error) throw new Error(`Resend rejected the friend request email: ${error.message}`);
}

/** A message from the public /contact form.
 *
 * Sent from noreply@ — the only DKIM-signed sender for betabook.ca — with
 * the visitor's address as Reply-To, so hitting reply in a mail client
 * addresses them rather than a mailbox nobody reads.
 *
 * Unlike the two helpers above this one surfaces a Resend failure. Those are
 * fire-and-forget side effects of an auth flow with a "resend" button behind
 * them; this one is the entire point of the visitor's click, and reporting
 * success for a message that never left would be a lie they can't detect.
 */
export async function sendContactEmail(opts: { replyTo: string; subject: string; text: string }) {
  const resend = await getResend();
  if (!resend) {
    console.log(
      `[dev] contact message to ${CONTACT_TO}, reply to ${opts.replyTo}\n${opts.subject}\n\n${opts.text}`,
    );
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to: CONTACT_TO,
    replyTo: opts.replyTo,
    subject: opts.subject,
    ...renderEmail({
      baseUrl: await getBaseUrl(),
      title: "New contact message",
      text: opts.text,
    }),
  });

  // Resend returns its errors rather than throwing them. A plain Error, not
  // an ActionError, so the action boundary logs it to the Worker logs and
  // shows the visitor the generic message instead of Resend's internals.
  if (error) throw new Error(`Resend rejected the contact message: ${error.message}`);
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
  const resend = await getResend();
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

  if (!resend) {
    console.log(`[dev] change request ${opts.decision} email for ${to}:\n${text}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `Your change request was ${opts.decision}`,
    ...renderEmail({
      baseUrl: base,
      title: `Your change request was ${opts.decision}`,
      text,
      links: opts.href ? [{ href: `${base}${opts.href}`, label: "View in Betabook" }] : [],
    }),
  });

  if (error) {
    throw new Error(`Resend rejected the change request decision email: ${error.message}`);
  }
}
