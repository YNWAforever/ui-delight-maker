import { AdminError } from "@/lib/admin/errors";

/** Router renders every loader exception as 500, including a known capability denial. */
export function authorizationSsrResponse(response: Response, error: unknown): Response {
  if (
    response.status !== 500 ||
    !(error instanceof AdminError) ||
    (error.code !== "FORBIDDEN" && error.code !== "OUTSIDE_SCOPE")
  ) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  return new Response(response.body, { status: 403, headers });
}
