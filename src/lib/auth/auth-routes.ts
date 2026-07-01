export const AUTH_BASE_PATH = "/login";

export function isPublicAuthPath(pathname: string) {
  return pathname === AUTH_BASE_PATH || pathname.startsWith(`${AUTH_BASE_PATH}/`);
}
