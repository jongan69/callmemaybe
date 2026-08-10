import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { PublicPage } from "../components/PublicPage";
import { publicConfiguration } from "../services/public-config.server";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — CallMeMaybe" },
];
export const loader = () => publicConfiguration();
export default function PrivacyPolicy() {
  const config = useLoaderData<typeof loader>();
  return (
    <PublicPage title="Privacy Policy">
      <p>Effective version: {config.legalVersion}.</p>
      <h2>What the app processes</h2>
      <p>
        CallMeMaybe processes the minimum order-associated name, shipping
        address, and phone data needed to provide merchant-requested or
        customer-consented order support. It also stores consent, suppression,
        eligibility, security-audit, and billing records.
      </p>
      <h2>How data is used</h2>
      <p>
        Data is used to verify the order and recipient, place an authorized
        support call, return a minimized structured outcome, present
        merchant-reviewed proposals, secure the service, and account for
        completed-call usage. Call content is not sold or used for advertising.
      </p>
      <h2>Processors and transfers</h2>
      <p>
        Shopify provides commerce data; CALL-E processes the minimum call
        instructions and recipient number; Render hosts the application and
        PostgreSQL database; and Sentry may receive redacted operational errors.
        Current subprocessors and transfer safeguards are available from
        support.
      </p>
      <h2>Audio, transcripts, and retention</h2>
      <p>
        CallMeMaybe does not store audio. Provider transcript content is handled
        transiently to derive an encrypted, minimized result and is not stored
        by CallMeMaybe. Operational case PII is normally deleted 90 days after
        case closure, subject to approved regional requirements. Export files
        expire after 30 days.
      </p>
      <h2>Your choices</h2>
      <p>
        Customers can revoke active order-call consent in their authenticated
        customer account. A spoken stop request is applied before any retry.
        Shopify privacy requests are authenticated, deduplicated, and processed
        through the app&apos;s privacy workflow.
      </p>
      <h2>Contact</h2>
      <p>
        Email{" "}
        <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a> for
        privacy requests.
      </p>
    </PublicPage>
  );
}
