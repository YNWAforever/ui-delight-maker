export const AUTH_BASE_PATH = "/login";
const DEFAULT_LOGIN_AUTH_PATH = "sign-in";

export function isPublicAuthPath(pathname: string) {
  return (
    pathname === AUTH_BASE_PATH ||
    pathname.startsWith(`${AUTH_BASE_PATH}/`) ||
    pathname.startsWith("/invite/")
  );
}

export function getLoginAuthPath(pathname: string) {
  if (pathname === AUTH_BASE_PATH) return DEFAULT_LOGIN_AUTH_PATH;
  if (!pathname.startsWith(`${AUTH_BASE_PATH}/`)) return DEFAULT_LOGIN_AUTH_PATH;

  return pathname.slice(`${AUTH_BASE_PATH}/`.length).split("/")[0] || DEFAULT_LOGIN_AUTH_PATH;
}
