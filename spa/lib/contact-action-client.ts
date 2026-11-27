import { submitContact } from "./actions-client";

export function submitContactMessage(formData: FormData) {
  const text = (field: string) => {
    const value = formData.get(field);
    return typeof value === "string" ? value : null;
  };
  return submitContact({
    name: text("name"),
    email: text("email"),
    message: text("message"),
    website: text("website"),
    elapsed: Number(text("elapsed") ?? 0),
  });
}
