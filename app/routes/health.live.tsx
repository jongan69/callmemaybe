export async function loader() {
  return Response.json({
    status: "live",
    timestamp: new Date().toISOString(),
  });
}
