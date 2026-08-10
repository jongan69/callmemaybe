import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { PublicPage } from "../components/PublicPage";
import { publicConfiguration } from "../services/public-config.server";

export const meta: MetaFunction = () => [{ title: "Support — CallMeMaybe" }];
export const loader = () => publicConfiguration();
export default function Support() {
  const config = useLoaderData<typeof loader>();
  return (
    <PublicPage title="Merchant support">
      <p>
        Email{" "}
        <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>.
        Target response time is one business day.
      </p>
      <p>
        For a production incident that blocks merchant access, privacy
        processing, billing, or call controls, use the subject “P1 incident.”
        Target acknowledgement is one hour. Never email phone numbers,
        addresses, session tokens, provider credentials, or transcripts.
      </p>
      <h2>Before contacting support</h2>
      <ul>
        <li>Use the global stop switch if calling behavior is unexpected.</li>
        <li>
          Include the non-sensitive case reference and approximate timestamp.
        </li>
        <li>
          Check the <a href="/status">service status</a> and retry subscription
          synchronization.
        </li>
      </ul>
    </PublicPage>
  );
}
