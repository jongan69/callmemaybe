import { readiness } from "../services/health.server";

export async function loader() {
  const result = await readiness();
  return Response.json(result, {
    status: result.status === "ready" ? 200 : 503,
  });
}
