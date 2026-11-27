import type { Metadata } from "next";

import { NotFoundMessage } from "@/components/ui/not-found-message";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <NotFoundMessage
      heading="Page not found"
      message="We couldn't find that page. Try searching for an area or climb instead."
    />
  );
}
