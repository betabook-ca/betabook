import { InlineAlert } from "@/components/ui/inline-alert";
import { SupportText } from "@/components/ui/support-text";

/** Problems found while reading the file, each with a support link that
 * names the import. */
export function CsvWarnings({
  warnings,
  subject,
}: {
  warnings: readonly string[];
  subject: string;
}) {
  if (warnings.length === 0) return null;
  return (
    <InlineAlert status="warning">
      <ul className="flex flex-col gap-1">
        {warnings.map((warning) => (
          <li key={warning}>
            <SupportText subject={subject}>{warning}</SupportText>
          </li>
        ))}
      </ul>
    </InlineAlert>
  );
}
