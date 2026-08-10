import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (!url.searchParams.get("shop")) {
    throw redirect("https://apps.shopify.com/callmemaybe");
  }
  return login(request);
};

export default function Auth() {
  return null;
}
