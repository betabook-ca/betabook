import { describe, expect, it } from "vitest";

import { ActionError } from "@/lib/action-result";
import {
  HONEYPOT_FIELD,
  MAX_EMAIL_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
  MIN_FILL_MS,
  formatContactEmail,
  looksAutomated,
  validateContactInput,
  type RawContactInput,
} from "@/lib/contact";

function raw(overrides: Partial<RawContactInput> = {}): RawContactInput {
  const base = {
    name: "Ada",
    email: "ada@example.com",
    message: "The grade on Squamish Buttress looks off.",
    [HONEYPOT_FIELD]: "",
    elapsed: String(MIN_FILL_MS + 1000),
  } as RawContactInput;
  return { ...base, ...overrides };
}

describe("looksAutomated", () => {
  it("passes an ordinary submission", () => {
    expect(looksAutomated(raw())).toBe(false);
  });

  it("catches a filled honeypot", () => {
    expect(looksAutomated(raw({ [HONEYPOT_FIELD]: "https://spam.example" }))).toBe(true);
  });

  it("ignores a honeypot holding only whitespace", () => {
    expect(looksAutomated(raw({ [HONEYPOT_FIELD]: "   " }))).toBe(false);
  });

  it("catches a submission faster than the floor", () => {
    expect(looksAutomated(raw({ elapsed: String(MIN_FILL_MS - 1) }))).toBe(true);
  });

  it.each([
    ["missing", null],
    ["not a number", "instantly"],
    ["negative", "-5000"],
  ])("catches an elapsed time that is %s", (_label, elapsed) => {
    expect(looksAutomated(raw({ elapsed }))).toBe(true);
  });
});

describe("validateContactInput", () => {
  it("trims and returns the three fields", () => {
    expect(validateContactInput(raw({ name: "  Ada  ", email: "  ada@example.com  " }))).toEqual({
      name: "Ada",
      email: "ada@example.com",
      message: "The grade on Squamish Buttress looks off.",
    });
  });

  it("treats a blank name as absent", () => {
    expect(validateContactInput(raw({ name: "   " })).name).toBeNull();
  });

  it.each([
    ["email", { email: "  " }, "Email is required"],
    ["message", { message: "" }, "Message is required"],
  ])("requires %s", (_field, overrides, expected) => {
    expect(() => validateContactInput(raw(overrides))).toThrow(new ActionError(expected));
  });

  it.each([
    ["no at sign", "ada.example.com"],
    ["no dot in the domain", "ada@example"],
    ["a space", "ada @example.com"],
    ["an embedded newline", "ada@example.com\nbcc: someone@example.com"],
    ["angle brackets", "Ada <ada@example.com>"],
    ["a second address", "ada@example.com,eve@example.com"],
  ])("rejects an email with %s", (_label, email) => {
    expect(() => validateContactInput(raw({ email }))).toThrow(
      new ActionError("Enter a valid email address"),
    );
  });

  it.each([
    ["name", { name: "a".repeat(MAX_NAME_LENGTH + 1) }, MAX_NAME_LENGTH, "Name"],
    ["email", { email: `${"a".repeat(MAX_EMAIL_LENGTH)}@example.com` }, MAX_EMAIL_LENGTH, "Email"],
    ["message", { message: "a".repeat(MAX_MESSAGE_LENGTH + 1) }, MAX_MESSAGE_LENGTH, "Message"],
  ])("caps the %s", (_field, overrides, max, label) => {
    expect(() => validateContactInput(raw(overrides))).toThrow(
      new ActionError(`${label} must be ${max} characters or fewer`),
    );
  });
});

describe("formatContactEmail", () => {
  it("carries all three fields into the body", () => {
    const { subject, text } = formatContactEmail({
      name: "Ada",
      email: "ada@example.com",
      message: "Line one\nline two",
    });

    expect(subject).toBe("Betabook contact: Ada");
    expect(text).toContain("From: Ada");
    expect(text).toContain("Email: ada@example.com");
    expect(text).toContain("Line one\nline two");
  });

  it("falls back to the email when there's no name", () => {
    const { subject, text } = formatContactEmail({
      name: null,
      email: "ada@example.com",
      message: "hi",
    });

    expect(subject).toBe("Betabook contact: ada@example.com");
    expect(text).toContain("(no name given)");
  });

  it("keeps the subject to one line and one screenful", () => {
    const { subject } = formatContactEmail({
      name: `Ada\r\nBcc: eve@example.com ${"x".repeat(200)}`,
      email: "ada@example.com",
      message: "hi",
    });

    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.length).toBeLessThanOrEqual("Betabook contact: ".length + 60);
  });
});
