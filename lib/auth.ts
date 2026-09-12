import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { betterAuth } from "better-auth";
import { APIError, getOAuthState } from "better-auth/api";

import { getDb } from "@/db/client";
import { getUserIdByName } from "@/db/queries";
import { getTermsAcceptance } from "@/db/queries/terms";
import * as schema from "@/db/schema";
import {
  deleteAccountPendingChangeRequests,
  deleteAccountSends,
  uniqueDisplayName,
} from "@/lib/account";
import { DISPLAY_NAME_TAKEN_MESSAGE, displayNameProblem } from "@/lib/display-name";
import { sendResetPasswordEmail, sendVerificationEmail } from "@/lib/email";
import {
  hasAcceptedCurrentTerms,
  TERMS_ACCESS_MESSAGE,
  TERMS_REQUIRED_MESSAGE,
  TERMS_VERSION,
} from "@/lib/terms";
import { sendWelcomeEmailOnce } from "@/lib/welcome-email";

async function authBuilder() {
  const db = await getDb();
  const { env } = await getCloudflareContext({ async: true });
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // `next dev` falls back to a different port whenever 3000 (or the next
    // few) are already taken locally (e.g. by Docker) — trust the common
    // local dev ports so sign-in/sign-up don't 403 on an origin mismatch
    // just because of which port happened to be free.
    trustedOrigins: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      "https://betabook.ca",
    ],
    advanced: {
      // Cloudflare appends to a client-sent X-Forwarded-For, so it can be
      // spoofed or left multi-valued; rate limits then share one bucket.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // Defaults to false, which would make a reset a password change and
      // nothing more. A reset is what a user does when they think someone
      // else is in their account, and the sliding session below would keep
      // that someone signed in for another month. No "sign out everywhere"
      // control exists in the UI, so this is the only thing that ends them.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => sendResetPasswordEmail(user.email, url),
    },
    emailVerification: {
      sendVerificationEmail: ({ user, url }) => sendVerificationEmail(user.email, url),
      // Better Auth returns early from /verify-email for an already-verified
      // user, so a re-clicked link never reaches here — this fires on the
      // false -> true transition and on a later change-email verification.
      // sendWelcomeEmailOnce is what tells those two apart.
      afterEmailVerification: async (verified) => {
        try {
          await sendWelcomeEmailOnce(db, verified);
        } catch (err) {
          // This hook is awaited inside GET /api/auth/verify-email, after the
          // emailVerified write has already committed. Throwing would turn a
          // verification that succeeded into a 500 the user reads as failure.
          // wrangler.jsonc has observability on, so console.error is the log.
          console.error("welcome email failed", err);
        }
      },
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
    },
    user: {
      // `role` is our own column (drizzle/schema/auth.ts), surfaced into
      // session.user so requireAdmin/isAdmin (lib/session.ts) can read it —
      // deliberately NOT better-auth's admin plugin, whose ban/impersonation/
      // user-management machinery this app doesn't want. input: false keeps
      // sign-up payloads from ever setting it; the only granter is
      // scripts/promote-admin.ts.
      additionalFields: {
        role: { type: "string", required: false, input: false },
        termsVersion: { type: "string", required: false, input: false },
        termsAcceptedAt: { type: "date", required: false, input: false },
      },
      deleteUser: {
        enabled: true,
        // Runs before better-auth deletes the account/session/user rows —
        // see lib/account.ts for why the user's sends have to go first,
        // as an explicit delete rather than via cascade.
        beforeDelete: async (deletedUser) => {
          await deleteAccountSends(db, deletedUser.id);
          await deleteAccountPendingChangeRequests(db, deletedUser.id);
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Display names are unique (user_name_unique_idx, migration 0034);
          // without this hook a collision would surface as a raw D1
          // constraint error. On the email form the user can pick again, so
          // reject with a message the form shows verbatim. Every other
          // creation path (Google OAuth) arrives with a name the user never
          // chose — failing would block the sign-in itself, so suffix the
          // name into uniqueness instead; it can be changed on /account.
          before: async (newUser, ctx) => {
            // Email sends a separate assent field; OAuth carries it in Better
            // Auth's verified state. Never trust a provider profile, callback
            // query, or client timestamp as an acceptance record.
            const acceptedVersion =
              ctx?.path === "/sign-up/email"
                ? ctx.body?.acceptedTermsVersion
                : (await getOAuthState())?.acceptedTermsVersion;
            if (acceptedVersion !== TERMS_VERSION) {
              throw new APIError("BAD_REQUEST", {
                code: "TERMS_ACCEPTANCE_REQUIRED",
                message: TERMS_REQUIRED_MESSAGE,
              });
            }
            const terms = { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() };
            if (ctx?.path === "/sign-up/email") {
              const name = newUser.name.trim();
              const problem = displayNameProblem(name);
              if (problem) throw new APIError("UNPROCESSABLE_ENTITY", { message: problem });
              if (await getUserIdByName(db, name)) {
                throw new APIError("UNPROCESSABLE_ENTITY", {
                  message: DISPLAY_NAME_TAKEN_MESSAGE,
                });
              }
              return { data: { ...newUser, name, ...terms } };
            }
            return {
              data: { ...newUser, name: await uniqueDisplayName(db, newUser.name), ...terms },
            };
          },
          after: async (createdUser) => {
            // OAuth users register with emailVerified: true immediately,
            // bypassing emailVerification.afterEmailVerification. Send the welcome
            // email once here; sendWelcomeEmailOnce guards idempotently via
            // `welcome_email_sent_at IS NULL`.
            if (createdUser.emailVerified) {
              try {
                await sendWelcomeEmailOnce(db, createdUser);
              } catch (err) {
                console.error("welcome email failed", err);
              }
            }
          },
        },
        update: {
          // better-auth's built-in POST /update-user endpoint is always
          // mounted (session-gated, values typed z.any()) and the UI never
          // calls it — but without this hook it would accept a blank or
          // over-long name and surface a duplicate as a raw D1 constraint
          // error. Same rules as sign-up, excluding the caller's own name
          // so a case-only change isn't rejected as taken.
          before: async (data, ctx) => {
            if (ctx?.path === "/update-user") {
              const userId = ctx.context.session?.user.id;
              if (!userId || !hasAcceptedCurrentTerms(await getTermsAcceptance(db, userId))) {
                throw new APIError("FORBIDDEN", {
                  code: "TERMS_ACCEPTANCE_REQUIRED",
                  message: TERMS_ACCESS_MESSAGE,
                });
              }
            }
            if (typeof data.name !== "string") return { data };
            const name = data.name.trim();
            const problem = displayNameProblem(name);
            if (problem) throw new APIError("UNPROCESSABLE_ENTITY", { message: problem });
            const holder = await getUserIdByName(db, name);
            if (holder && holder !== ctx?.context.session?.user.id) {
              throw new APIError("UNPROCESSABLE_ENTITY", { message: DISPLAY_NAME_TAKEN_MESSAGE });
            }
            return { data: { ...data, name } };
          },
        },
      },
    },
    onAPIError: {
      errorURL: "/sign-in",
    },
    session: {
      // A month-long sliding window: every time the session is used and
      // updateAge is reached, expiresIn resets from that point. In practice
      // this keeps a session alive indefinitely for any user active at
      // least once a month, without disabling Better Auth's normal refresh
      // mechanism. Sessions only end sooner via explicit sign-out (or
      // revokeSession/revokeOtherSessions).
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
  });
}

let authInstance: Awaited<ReturnType<typeof authBuilder>> | null = null;

export async function initAuth() {
  if (!authInstance) authInstance = await authBuilder();
  return authInstance;
}

export async function isGoogleOAuthEnabled(): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
