import type { Metadata } from "next";

import { NotFoundMessage } from "@/components/ui/not-found-message";

export const metadata: Metadata = {
  title: "Climber not found",
};

export default function UserNotFound() {
  return (
    <NotFoundMessage
      heading="Climber not found"
      message="This profile is private or doesn't exist."
    />
  );
}
