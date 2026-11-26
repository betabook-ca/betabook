import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";

export async function submitContactMessage(formData: FormData): Promise<ActionResult> {
  try {
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      message: formData.get("message"),
      website: formData.get("website"),
      elapsed: Number(formData.get("elapsed") ?? 0),
    };
    const response = await fetch("/api/actions/submitContactMessage", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args: [payload] }),
    });
    if (!response.ok) {
      return { ok: false, error: GENERIC_ERROR_MESSAGE };
    }
    return await response.json<ActionResult>();
  } catch {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
}
