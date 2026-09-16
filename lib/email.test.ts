import { beforeEach, expect, it, vi } from "vitest";

import {
  sendChangeRequestDecisionEmail,
  sendContactEmail,
  sendFriendRequestEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from "./email";

const mail = vi.hoisted(() => ({
  apiKey: "test-key",
  baseUrl: "https://preview.betabook.ca/",
  send: vi.fn<
    (message: {
      to: string;
      subject: string;
      html?: string;
      text?: string;
      replyTo?: string;
    }) => Promise<{ error: { message: string } | null }>
  >(),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: { RESEND_API_KEY: mail.apiKey, BETTER_AUTH_URL: mail.baseUrl },
  }),
}));
vi.mock("resend", () => ({
  Resend: class {
    public emails = { send: mail.send };
  },
}));

const name = 'Casey <script>alert("hi")</script> & Co';
const url = "https://preview.betabook.ca/api/auth/verify-email?token=abc&callbackURL=%2Fsign-in";
const messages = [
  {
    kind: "verification",
    send: () => sendVerificationEmail("reader@example.com", url),
    subject: "Verify your Betabook email",
    text: url,
  },
  {
    kind: "password reset",
    send: () => sendResetPasswordEmail("reader@example.com", url),
    subject: "Reset your Betabook password",
    text: url,
  },
  {
    kind: "welcome",
    send: () => sendWelcomeEmail("reader@example.com", name),
    subject: "Welcome to Betabook",
    text: `Hi ${name},`,
  },
  {
    kind: "friend request",
    send: () => sendFriendRequestEmail("reader@example.com", name),
    subject: "New friend request on Betabook",
    text: `${name} sent you a friend request`,
  },
  {
    kind: "contact",
    send: () =>
      sendContactEmail({
        replyTo: "reader@example.com",
        subject: name,
        text: `From ${name}\n\nFirst line\nSecond line`,
      }),
    subject: name,
    text: `From ${name}`,
  },
  {
    kind: "moderation",
    send: () =>
      sendChangeRequestDecisionEmail("reader@example.com", {
        name,
        summary: "Rename <img src=x>",
        details: ["New name: Rock & Roll"],
        decision: "rejected",
        note: "Keep <b>the original</b>\nThanks!",
        href: "/areas/123/rock",
      }),
    subject: "Your change request was rejected",
    text: "Keep <b>the original</b>\nThanks!",
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
  mail.apiKey = "test-key";
  mail.baseUrl = "https://preview.betabook.ca/";
  mail.send.mockReset().mockResolvedValue({ error: null });
});

it.each(messages)("sends branded HTML and readable plain text for $kind", async (message) => {
  await message.send();
  expect(mail.send).toHaveBeenCalledTimes(1);
  const delivered = mail.send.mock.calls[0][0];
  expect(delivered.subject).toBe(message.subject);
  expect(delivered.text).toContain(message.text);
  expect(delivered.html).toContain(
    '<img src="https://preview.betabook.ca/branding/betabook-lockup-email.png"',
  );
  expect(delivered.html).toContain('alt="Betabook — Climb · Log · Progress"');
  expect(delivered.html).toContain("<!DOCTYPE html>");
  expect(delivered.html).not.toContain("<script>");
  expect(delivered.html).not.toContain("<img src=x>");
  expect(delivered.html).not.toContain("<b>the original</b>");
  expect(delivered.to).toBe(
    message.kind === "contact" ? "hello@betabook.ca" : "reader@example.com",
  );
});

it("escapes auth link attributes without changing their tokens or plain-text URLs", async () => {
  const specialUrl = `${url}&extra="quoted"`;
  await sendVerificationEmail("reader@example.com", specialUrl);
  const delivered = mail.send.mock.calls[0][0];
  expect(delivered.text).toContain(specialUrl);
  expect(delivered.html).toContain(
    'href="https://preview.betabook.ca/api/auth/verify-email?token=abc&amp;callbackURL=%2Fsign-in&amp;extra=&quot;quoted&quot;"',
  );
});

it("shows welcome buttons without duplicate URLs and retains every plain-text destination", async () => {
  await sendWelcomeEmail("reader@example.com", "Casey");
  const delivered = mail.send.mock.calls[0][0];
  const visibleText: string[] = [];
  const destinations: (string | null)[] = [];
  await new HTMLRewriter()
    .on("body", {
      text: (chunk) => {
        visibleText.push(chunk.text);
      },
    })
    .on("a", {
      element: (element) => {
        destinations.push(element.getAttribute("href"));
      },
    })
    .transform(new Response(delivered.html))
    .text();

  const base = "https://preview.betabook.ca";
  expect(visibleText.join("")).not.toContain("https://");
  expect(visibleText.join("")).toContain("Import your logbook");
  expect(visibleText.join("")).toContain("Log your first send");
  expect(visibleText.join("")).toContain("Get in touch");
  expect(destinations).toEqual([base, `${base}/account/import`, base, `${base}/contact`, base]);
  expect(delivered.text?.split("\n")).toEqual(
    expect.arrayContaining([`${base}/account/import`, base, `${base}/contact`]),
  );
});

it("preserves contact Reply-To and line breaks while escaping visitor content", async () => {
  await messages[4].send();
  expect(mail.send.mock.calls[0][0]).toMatchObject({
    replyTo: "reader@example.com",
    text: `From ${name}\n\nFirst line\nSecond line`,
    html: expect.stringContaining("First line<br>Second line"),
  });
  expect(mail.send.mock.calls[0][0].html).toContain(
    "Casey &lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt; &amp; Co",
  );
});

it.each(messages)("keeps $kind available locally without sending mail", async (message) => {
  mail.apiKey = "";
  mail.baseUrl = "http://localhost:3000";
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  await message.send();
  expect(mail.send).not.toHaveBeenCalled();
  expect(logged).toHaveBeenCalledTimes(1);
  expect(logged.mock.calls[0][0]).toContain(message.text);
});

it.each(messages)(
  "does not log $kind content when a deployed environment lacks its email key",
  async (message) => {
    mail.apiKey = "";
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(message.send()).rejects.toThrow("Email delivery is not configured");
    expect(mail.send).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  },
);

it.each([
  "https://betabook.ca",
  "https://localhost.example.com",
  "https://127.0.0.1.example.com",
  "ftp://localhost",
])("never treats %s as a local email preview", async (baseUrl) => {
  mail.apiKey = "";
  mail.baseUrl = baseUrl;
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  await expect(sendResetPasswordEmail("reader@example.com", url)).rejects.toThrow(
    "Email delivery is not configured",
  );
  expect(logged).not.toHaveBeenCalled();
});

it.each(["http://127.0.0.1:3000", "http://[::1]:3000", "https://localhost:3000"])(
  "preserves verification links for local development at %s",
  async (baseUrl) => {
    mail.apiKey = "";
    mail.baseUrl = baseUrl;
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendVerificationEmail("reader@example.com", url);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(url));
    expect(mail.send).not.toHaveBeenCalled();
  },
);

it.each([
  ["verification", sendVerificationEmail],
  ["password reset", sendResetPasswordEmail],
] as const)("reports a rejected %s delivery", async (_kind, send) => {
  mail.send.mockResolvedValue({ error: { message: "Invalid API key" } });

  await expect(send("reader@example.com", url)).rejects.toThrow("Invalid API key");
});
