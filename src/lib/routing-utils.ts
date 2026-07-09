import { useRouterState } from "@tanstack/react-router";

function normalizePath(path: string) {
  if (path === "/") return "/";
  return path.replace(/\/+$/, "") || "/";
}

export function useIsExactPath(path: string) {
  return useRouterState({
    select: (state) => normalizePath(state.location.pathname) === normalizePath(path),
  });
}
