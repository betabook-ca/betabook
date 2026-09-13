import { AppLink } from "@/components/ui/app-link";
import { PageTitle, SectionHeading } from "@/components/ui/typography";

export function Terms20260909() {
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-4 leading-relaxed">
      <PageTitle>Terms of Service</PageTitle>
      <p className="text-sm text-muted">
        Last updated: <time dateTime="2026-09-09">September 9, 2026</time>
      </p>
      <p>
        These terms govern your use of Betabook, a climbing logbook and community crag database at
        betabook.ca. “We” and “us” refer to the operators of Betabook. By agreeing when you create
        an account, you accept these terms. If you do not agree, do not create an account.
      </p>

      <SectionHeading className="mt-4">1. Your account</SectionHeading>
      <p>
        You must be able to enter into a binding agreement under the laws that apply to you. Provide
        accurate account information, keep your sign-in credentials secure, and use only accounts
        you are authorized to access. You are responsible for activity you authorize through your
        account. Contact us if you believe someone has accessed it without permission.
      </p>

      <SectionHeading className="mt-4">2. Climbing and outdoor safety</SectionHeading>
      <p>
        Climbing is dangerous and can cause serious injury or death. Betabook is a record of
        climbing experiences, not a safety service, guidebook, or substitute for qualified
        instruction, appropriate equipment, current local guidance, and your own assessment.
      </p>
      <p>
        Community descriptions, grades, locations, ratings, and activity may be inaccurate,
        incomplete, or out of date. A listed climb does not establish that it is safe, open, or
        legal to access. Check conditions, access restrictions, closures, equipment, and your
        abilities independently. Respect landowners, local communities, and the environment.
      </p>

      <SectionHeading className="mt-4">3. Respectful and lawful use</SectionHeading>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          Do not harass, threaten, impersonate, or publish someone else’s private information.
        </li>
        <li>
          Do not post unlawful content, spam, malicious software, or deliberately misleading beta.
        </li>
        <li>Do not bypass access controls, access private records, or disrupt the service.</li>
        <li>Contribute only material you have the right to share, including when using imports.</li>
      </ul>

      <SectionHeading className="mt-4">4. Your contributions</SectionHeading>
      <p>
        You retain ownership of content you contribute. You grant us a non-exclusive, royalty-free
        license to store, reproduce, format, and display that content as needed to operate Betabook
        and provide the features and sharing settings you use. This does not transfer ownership of
        your content to us.
      </p>
      <p>
        Area and climb names, locations, grades, and descriptions are public contributions to the
        shared catalog. They may be corrected, moderated, or retained after you close your account.
        Do not copy guidebook descriptions or other protected material without permission. Report
        content or copyright concerns through our{" "}
        <AppLink href="/contact" className="inline underline">
          contact form
        </AppLink>
        .
      </p>

      <SectionHeading className="mt-4">5. Sharing and third-party services</SectionHeading>
      <p>
        Your profile and activity have audience controls in Account. New accounts share send
        commentary with signed-in members and journal entries with accepted friends by default. A
        private profile restricts both to you. Review these settings before recording sensitive
        information; shared content may be copied by people who can see it.
      </p>
      <p>
        Google sign-in, linked websites, and services you import from operate under their own terms.
        Only import records you are entitled to use. We do not control those services or guarantee
        their availability. Agreement to these terms is not consent to unrelated marketing or new
        uses of personal information.
      </p>

      <SectionHeading className="mt-4">6. Availability and account closure</SectionHeading>
      <p>
        We may change, interrupt, or discontinue features, and may remove content or restrict access
        where necessary to address misuse, security issues, or legal obligations. We do not
        guarantee uninterrupted access or permanent storage. Keep your own copies of records that
        matter to you; sends can be exported from Account.
      </p>
      <p>
        You can stop using Betabook at any time and delete your account from Account. Contact us if
        you need help with account access, deletion, or a moderation decision.
      </p>

      <SectionHeading className="mt-4">7. Disclaimers and limits</SectionHeading>
      <p>
        To the extent permitted by applicable law, Betabook and its community information are
        provided “as is” and “as available,” without warranties of accuracy, availability, or
        fitness for a particular purpose. You are responsible for your climbing and access
        decisions, including checking any information you obtain here.
      </p>
      <p>
        To the extent permitted by applicable law, we are not liable for indirect or consequential
        losses arising from use of the service, including loss of data or interruption of access.
        Nothing in these terms excludes liability or limits consumer rights that cannot lawfully be
        excluded or limited.
      </p>

      <SectionHeading className="mt-4">8. Changes and contact</SectionHeading>
      <p>
        Revised terms will be posted on this page with an updated date. Changes apply prospectively,
        subject to any notice or renewed agreement required by applicable law. For questions about
        these terms or the service, use our{" "}
        <AppLink href="/contact" className="inline underline">
          contact form
        </AppLink>
        .
      </p>
    </article>
  );
}
