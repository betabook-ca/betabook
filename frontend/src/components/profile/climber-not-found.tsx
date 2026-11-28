import { NotFoundMessage } from "@/components/ui/not-found-message";

/** A profile URL whose climber doesn't exist or isn't visible to the viewer. */
export function ClimberNotFound({
  message = "No climber profile is available at this URL.",
}: {
  message?: string;
}) {
  return <NotFoundMessage heading="Climber not found" message={message} />;
}
