import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";
import { submitContactMessage } from "@/lib/contact-action";

import { ContactForm } from "./contact-form";

vi.mock("@/lib/contact-action", () => ({
  submitContactMessage: vi.fn<() => Promise<ActionResult>>(),
}));
vi.mock("@/hooks/use-client-session", () => ({ useClientSession: () => null }));

const submit = vi.mocked(submitContactMessage);

beforeEach(() => {
  submit.mockReset();
});

it("keeps the message and explains a submission that threw", async () => {
  submit.mockRejectedValue(new Error("offline"));
  const user = userEvent.setup();
  render(<ContactForm />);

  await user.type(screen.getByRole("textbox", { name: "Email" }), "a@example.com");
  await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello there");
  await user.click(screen.getByRole("button", { name: "Send Message" }));

  expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeVisible();
  expect(submit).toHaveBeenCalledOnce();
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Hello there");
  await waitFor(() => expect(screen.getByRole("button", { name: "Send Message" })).toBeEnabled());
});
