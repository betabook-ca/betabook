import type { Metadata } from "next";

import { NotFoundMessage } from "@/components/ui/not-found-message";

export const metadata: Metadata = {
  title: "Area not found",
};

export default function AreaNotFound() {
  return (
    <NotFoundMessage
      heading="Area not found"
      message="We couldn't find that area. It may have been removed, or the link may be wrong."
    />
  );
}
