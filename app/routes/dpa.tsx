import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { PublicPage } from "../components/PublicPage";
import { publicConfiguration } from "../services/public-config.server";

export const meta: MetaFunction = () => [
  { title: "Data Processing Addendum — CallMeMaybe" },
];
export const loader = () => publicConfiguration();

export default function DataProcessingAddendum() {
  const config = useLoaderData<typeof loader>();
  return (
    <PublicPage title="Data Processing Addendum">
      <p>Effective version: {config.legalVersion}.</p>
      <p>
        This addendum applies when CallMeMaybe processes personal data for a
        merchant using the service. The merchant is the controller or business
        and CallMeMaybe is the processor or service provider, except where law
        assigns a different role.
      </p>
      <h2>Instructions and purpose</h2>
      <p>
        CallMeMaybe processes only the minimum order-associated data needed to
        provide consent-based order-support calls, merchant-approved carrier
        calls, security, privacy requests, and completed-call accounting. Data
        is not sold or used for targeted advertising.
      </p>
      <h2>Safeguards and personnel</h2>
      <p>
        The service uses encryption in transit and at rest, application-level
        encryption for sensitive fields, tenant isolation, least privilege,
        staff MFA, audited production access, incident procedures, retention
        controls, and tested deletion workflows. Authorized personnel are bound
        by confidentiality.
      </p>
      <h2>Subprocessors and transfers</h2>
      <p>
        Shopify supplies commerce data, CALL-E processes authorized calls,
        Render hosts the application and database, and Sentry receives redacted
        operational telemetry. A counsel-approved subprocessor schedule,
        transfer mechanism, and objection process must be published with the
        signed production version.
      </p>
      <h2>Requests, deletion, and incidents</h2>
      <p>
        CallMeMaybe supports authenticated access and deletion workflows,
        notifies merchants of qualifying incidents under the signed agreement,
        and deletes or returns data at termination subject to required legal
        evidence and suppression obligations.
      </p>
      <p>
        Request the signed addendum at{" "}
        <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>.
      </p>
    </PublicPage>
  );
}
