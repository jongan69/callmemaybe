import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { PublicPage } from "../components/PublicPage";
import { publicConfiguration } from "../services/public-config.server";

export const meta: MetaFunction = () => [
  { title: "Terms of Service — CallMeMaybe" },
];
export const loader = () => publicConfiguration();
export default function Terms() {
  const config = useLoaderData<typeof loader>();
  return (
    <PublicPage title="Terms of Service">
      <p>Effective version: {config.legalVersion}.</p>
      <h2>Service</h2>
      <p>
        CallMeMaybe provides AI-assisted phone workflows for Shopify order
        support. Merchant users control enabled regions, approved carrier
        numbers, calling windows, and a global stop switch.
      </p>
      <h2>Merchant responsibility</h2>
      <p>
        The merchant must use the service only for lawful order support,
        maintain accurate business identity and disclosures, enable only
        approved regions, honor revocation and suppression, and review every
        proposed consequential order action.
      </p>
      <h2>Proposals, not automatic resolutions</h2>
      <p>
        Returns, refunds, replacements, cancellations, address changes, and
        carrier-derived next steps are captured proposals. The merchant must
        confirm them against a fresh Shopify order snapshot before any supported
        mutation is attempted.
      </p>
      <h2>Pricing</h2>
      <p>
        The plan is $29 USD per month, includes 250 completed calls, and charges
        $0.10 per additional completed call. The 14-day trial includes 25
        completed calls. A hard application cutoff applies at 2,250 completed
        calls per cycle, limiting overage to $200. Failed, busy, unanswered,
        canceled, and provider-error calls are not usage units.
      </p>
      <h2>Acceptable use</h2>
      <p>
        The <a href="/acceptable-use">Acceptable Use and Calling Policy</a> is
        part of these terms. Abuse, deceptive identity, unlawful automated
        calling, bypassing consent, or calling unverified third parties may
        result in immediate suspension.
      </p>
      <h2>Contact</h2>
      <p>
        Questions:{" "}
        <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>.
      </p>
    </PublicPage>
  );
}
