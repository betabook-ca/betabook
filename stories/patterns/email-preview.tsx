import { useState } from "react";

import { renderEmail, type EmailTemplateOptions } from "@/lib/email-template";
import { StoryPage } from "@/stories/fixtures/story-layout";

/** Display the actual email document without inheriting application styles. */
export function EmailPreview(props: Omit<EmailTemplateOptions, "baseUrl">) {
  const [height, setHeight] = useState(900);
  const { html } = renderEmail({ ...props, baseUrl: window.location.origin });
  return (
    <StoryPage title="Branded email">
      <p className="text-sm text-muted">
        The shared Resend HTML template, with the full About-page logo as a PNG and a plain-text
        alternative. Sample links stay in this preview. Inbox apps may apply their own dark-mode
        colors.
      </p>
      <iframe
        title="Email preview"
        className="w-full border-0"
        style={{ height }}
        sandbox="allow-same-origin"
        srcDoc={html}
        onLoad={(event) => {
          const document = event.currentTarget.contentDocument;
          if (!document) return;
          document.addEventListener("click", (event) => event.preventDefault());
          setHeight(document.documentElement.scrollHeight);
        }}
      />
    </StoryPage>
  );
}
