import type { Metadata } from "next";

import { NotFoundMessage } from "@/components/ui/not-found-message";

export const metadata: Metadata = {
  title: "Climb not found",
};

export default function ClimbNotFound() {
  return (
    <NotFoundMessage
      heading="Climb not found"
      message="We couldn't find that climb. It may have been removed, or the link may be wrong."
    />
  );
}
