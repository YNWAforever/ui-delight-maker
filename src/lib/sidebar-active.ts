/**
 * Which sidebar entry the current path highlights.
 *
 * Extracted from the closure inside AppSidebar so it can be tested directly. It was
 * previously reachable only by rendering the component, which needs router and provider
 * context — so the only "coverage" it had was a test grepping app-sidebar.tsx for the
 * literal `const isActive = (item: SidebarItem)`. That asserted the code was written a
 * particular way and said nothing about which entry lights up.
 */
export type SidebarActiveTarget = {
  url: string;
  /** null opts the entry out of highlighting entirely; undefined falls back to `url`. */
  activePath?: string | null;
};

export function isSidebarItemActive(item: SidebarActiveTarget, currentPath: string): boolean {
  if (item.activePath === null) return false;

  const path = (item.activePath ?? item.url).split("?")[0];

  if (path === "/") return currentPath === "/";
  return currentPath === path || currentPath.startsWith(path + "/");
}
