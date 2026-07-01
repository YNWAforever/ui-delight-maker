export function getAuthClientBaseUrl() {
  if (typeof window !== "undefined") {
    return new URL("/api/auth", window.location.origin).toString();
  }

  const appBaseUrl = typeof process !== "undefined" ? process.env.APP_BASE_URL : undefined;
  return new URL("/api/auth", appBaseUrl ?? "http://localhost:5173").toString();
}
