import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { PublicPage } from "../components/PublicPage";
import { publicConfiguration } from "../services/public-config.server";

export const meta: MetaFunction = () => [{ title: "Security — CallMeMaybe" }];
export const loader = () => publicConfiguration();
export default function Security() {
  const config = useLoaderData<typeof loader>();
  return (
    <PublicPage title="Security">
      <p>
        CallMeMaybe uses tenant-scoped authorization, Shopify-signed sessions
        and webhooks, TLS, encrypted PostgreSQL storage, application-level
        AES-256-GCM encryption with versioned keys, hashed phone matching,
        idempotent background jobs, and redacted operational logging.
      </p>
      <p>
        CALL-E callbacks use a secret callback path, a unique per-call nonce,
        replay deduplication, and canonical provider refetch before a terminal
        result is accepted. Production refuses fixture mode and incomplete
        security or billing configuration.
      </p>
      <p>
        Report vulnerabilities privately to{" "}
        <a href={`mailto:${config.securityEmail}`}>{config.securityEmail}</a>.
        Include impact, affected URL, reproduction steps, and a safe proof of
        concept. Do not access customer data or disrupt service.
      </p>
    </PublicPage>
  );
}
