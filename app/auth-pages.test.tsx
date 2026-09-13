import { beforeEach, describe, expect, it, vi } from "vitest";

import SignInPage from "@/app/sign-in/page";
import SignUpPage from "@/app/sign-up/page";

const sessionState = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
}));

const mockRedirect = vi.hoisted(() =>
  vi.fn<(url: string) => never>((url) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);

const mockSignInForm = vi.hoisted(() =>
  vi.fn<(props: { next?: string; googleEnabled?: boolean; initialError?: string | null }) => null>(
    () => null,
  ),
);
const mockSignUpForm = vi.hoisted(() =>
  vi.fn<(props: { next?: string; googleEnabled?: boolean }) => null>(() => null),
);
const mockIsGoogleOAuthEnabled = vi.hoisted(() => vi.fn<() => Promise<boolean>>(async () => true));
const mockGetTurnstileSiteKey = vi.hoisted(() =>
  vi.fn<() => Promise<string | null>>(async () => null),
);

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/lib/session", () => ({
  getMemberSession: vi.fn<() => Promise<{ user: { id: string } } | null>>(
    async () => sessionState.session,
  ),
}));

vi.mock("@/lib/auth", () => ({
  isGoogleOAuthEnabled: mockIsGoogleOAuthEnabled,
  getTurnstileSiteKey: mockGetTurnstileSiteKey,
}));

vi.mock("@/components/sign-in-form", () => ({
  SignInForm: mockSignInForm,
}));

vi.mock("@/components/sign-up-form", () => ({
  SignUpForm: mockSignUpForm,
}));

describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.session = null;
  });

  it("redirects an authenticated user to their own page by default", async () => {
    sessionState.session = { user: { id: "climber-123" } };

    await expect(SignInPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/users/climber-123",
    );
    expect(mockRedirect).toHaveBeenCalledExactlyOnceWith("/users/climber-123");
    expect(mockIsGoogleOAuthEnabled).not.toHaveBeenCalled();
  });

  it("redirects an authenticated user to the safe next path if specified", async () => {
    sessionState.session = { user: { id: "climber-123" } };

    await expect(
      SignInPage({ searchParams: Promise.resolve({ next: "/areas/new" }) }),
    ).rejects.toThrow("REDIRECT:/areas/new");
    expect(mockRedirect).toHaveBeenCalledExactlyOnceWith("/areas/new");
    expect(mockIsGoogleOAuthEnabled).not.toHaveBeenCalled();
  });

  it("renders the sign-in form for unauthenticated users", async () => {
    sessionState.session = null;

    const result = await SignInPage({
      searchParams: Promise.resolve({}),
    });

    expect(result.type).toBe(mockSignInForm);
    expect(mockRedirect).not.toHaveBeenCalled();
    const element = result as React.ReactElement<{
      next?: string;
      googleEnabled: boolean;
      initialError?: string;
    }>;
    expect(element.props.googleEnabled).toBe(true);
    expect(element.props.initialError).toBeUndefined();
    expect(element.props.next).toBeUndefined();
  });

  it("passes next path to the sign-in form for unauthenticated users", async () => {
    sessionState.session = null;

    const result = await SignInPage({
      searchParams: Promise.resolve({ next: "/account/import" }),
    });

    expect(result.type).toBe(mockSignInForm);
    expect(mockRedirect).not.toHaveBeenCalled();
    const element = result as React.ReactElement<{ next?: string; googleEnabled: boolean }>;
    expect(element.props.next).toBe("/account/import");
    expect(element.props.googleEnabled).toBe(true);
  });

  it("passes formatted OAuth error to the sign-in form when error param is present", async () => {
    sessionState.session = null;

    const result = await SignInPage({
      searchParams: Promise.resolve({ error: "access_denied" }),
    });

    expect(result.type).toBe(mockSignInForm);
    const element = result as React.ReactElement<{ googleEnabled: boolean; initialError?: string }>;
    expect(element.props.googleEnabled).toBe(true);
    expect(element.props.initialError).toBe("Google sign-in was cancelled.");
  });

  it("passes googleEnabled: false when Google OAuth credentials are not set", async () => {
    sessionState.session = null;
    mockIsGoogleOAuthEnabled.mockResolvedValueOnce(false);

    const result = await SignInPage({
      searchParams: Promise.resolve({}),
    });

    expect(result.type).toBe(mockSignInForm);
    const element = result as React.ReactElement<{ googleEnabled: boolean }>;
    expect(element.props.googleEnabled).toBe(false);
  });
});

describe("SignUpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.session = null;
    mockIsGoogleOAuthEnabled.mockResolvedValue(true);
  });

  it("redirects an authenticated user to their own page by default", async () => {
    sessionState.session = { user: { id: "climber-123" } };

    await expect(SignUpPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/users/climber-123",
    );
    expect(mockRedirect).toHaveBeenCalledExactlyOnceWith("/users/climber-123");
    expect(mockIsGoogleOAuthEnabled).not.toHaveBeenCalled();
  });

  it("redirects an authenticated user to the safe next path if specified", async () => {
    sessionState.session = { user: { id: "climber-123" } };

    await expect(
      SignUpPage({ searchParams: Promise.resolve({ next: "/climbs/new" }) }),
    ).rejects.toThrow("REDIRECT:/climbs/new");
    expect(mockRedirect).toHaveBeenCalledExactlyOnceWith("/climbs/new");
    expect(mockIsGoogleOAuthEnabled).not.toHaveBeenCalled();
  });

  it("renders the sign-up form for unauthenticated users", async () => {
    sessionState.session = null;

    const result = await SignUpPage({
      searchParams: Promise.resolve({}),
    });

    expect(result.type).toBe(mockSignUpForm);
    expect(mockRedirect).not.toHaveBeenCalled();
    const element = result as React.ReactElement<{ next?: string; googleEnabled: boolean }>;
    expect(element.props.googleEnabled).toBe(true);
    expect(element.props.next).toBeUndefined();
  });

  it("passes next path to the sign-up form for unauthenticated users", async () => {
    sessionState.session = null;

    const result = await SignUpPage({
      searchParams: Promise.resolve({ next: "/climbs/new" }),
    });

    expect(result.type).toBe(mockSignUpForm);
    expect(mockRedirect).not.toHaveBeenCalled();
    const element = result as React.ReactElement<{ next?: string; googleEnabled: boolean }>;
    expect(element.props.next).toBe("/climbs/new");
    expect(element.props.googleEnabled).toBe(true);
  });

  it("passes googleEnabled: false to the sign-up form when Google OAuth is disabled", async () => {
    sessionState.session = null;
    mockIsGoogleOAuthEnabled.mockResolvedValueOnce(false);

    const result = await SignUpPage({
      searchParams: Promise.resolve({}),
    });

    expect(result.type).toBe(mockSignUpForm);
    const element = result as React.ReactElement<{ googleEnabled: boolean }>;
    expect(element.props.googleEnabled).toBe(false);
  });
});

describe("Turnstile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.session = null;
  });

  it("passes the configured site key to the sign-in and sign-up forms", async () => {
    mockGetTurnstileSiteKey.mockResolvedValueOnce("site-key").mockResolvedValueOnce("site-key");

    const signIn = (await SignInPage({ searchParams: Promise.resolve({}) })) as React.ReactElement<{
      turnstileSiteKey?: string | null;
    }>;
    const signUp = (await SignUpPage({ searchParams: Promise.resolve({}) })) as React.ReactElement<{
      turnstileSiteKey?: string | null;
    }>;

    expect(signIn.props.turnstileSiteKey).toBe("site-key");
    expect(signUp.props.turnstileSiteKey).toBe("site-key");
  });
});
