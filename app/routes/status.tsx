import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { PublicPage } from "../components/PublicPage";
import { publicConfiguration } from "../services/public-config.server";

export const meta: MetaFunction = () => [{ title: "Status — CallMeMaybe" }];
export const loader = () => publicConfiguration();
export default function Status() {
  const { statusUrl } = useLoaderData<typeof loader>();
  return (
    <PublicPage title="Service status">
      {statusUrl ? (
        <p>
          <a href={statusUrl}>Open the public CallMeMaybe status page</a>.
        </p>
      ) : (
        <p>
          The external status page is pending production operations setup.
          Process readiness remains available at{" "}
          <a href="/health/ready">/health/ready</a>.
        </p>
      )}
      <p>
        Web-service availability and provider-dependent call reliability are
        reported separately.
      </p>
    </PublicPage>
  );
}
