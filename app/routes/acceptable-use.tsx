import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { PublicPage } from "../components/PublicPage";
import { publicConfiguration } from "../services/public-config.server";

export const meta: MetaFunction = () => [
  { title: "Acceptable Use and Calling Policy — CallMeMaybe" },
];
export const loader = () => publicConfiguration();
export default function AcceptableUse() {
  const config = useLoaderData<typeof loader>();
  return (
    <PublicPage title="Acceptable Use and Calling Policy">
      <p>
        CallMeMaybe may be used only for legitimate support concerning a Shopify
        order or for a merchant-approved call to a verified official carrier
        support number.
      </p>
      <h2>Required</h2>
      <ul>
        <li>Use accurate merchant identity and the approved AI disclosure.</li>
        <li>
          Obtain active, purpose-specific customer consent before customer
          outreach.
        </li>
        <li>
          Honor local calling windows, attempt limits, do-not-call rules,
          revocation, and suppression immediately.
        </li>
        <li>
          Use identity verification before disclosing customer or order
          information.
        </li>
      </ul>
      <h2>Prohibited</h2>
      <ul>
        <li>
          Marketing, lead generation, debt collection, political calling,
          emergency services, harassment, impersonation, or unlawful
          robocalling.
        </li>
        <li>
          Calling purchased lists, manually substituted customer numbers, or
          unverified carrier numbers.
        </li>
        <li>
          Disabling safeguards, hiding AI involvement, recording audio through
          the app, or using outcomes as proof of legal consent.
        </li>
      </ul>
      <p>
        Report abuse to{" "}
        <a href={`mailto:${config.securityEmail}`}>{config.securityEmail}</a>.
      </p>
    </PublicPage>
  );
}
