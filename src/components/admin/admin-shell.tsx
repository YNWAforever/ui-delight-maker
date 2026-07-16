import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  FileKey2,
  LayoutDashboard,
  ScrollText,
  UsersRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AdminNavigationItem } from "@/lib/admin/types";

const icons: Record<AdminNavigationItem["key"], LucideIcon> = {
  overview: LayoutDashboard,
  people: UsersRound,
  teams: Users,
  access: FileKey2,
  audit: ScrollText,
};

type AdminShellProps = {
  navigation: readonly AdminNavigationItem[];
  children: ReactNode;
};

export function AdminShell({ navigation, children }: AdminShellProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="flex min-h-full min-w-0 flex-col md:flex-row">
      <aside className="border-b border-border bg-muted/20 md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="px-4 py-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Control plane
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Admin workspace
          </h1>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            People, teams, access, and audit.
          </p>
        </div>
        <nav aria-label="Admin navigation" className="px-2 pb-3 md:pb-5">
          <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {navigation.map((item) => {
              const Icon = icons[item.key];
              const active =
                item.href === "/admin"
                  ? pathname === "/admin" || pathname === "/admin/"
                  : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.key}
                  to={item.href}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  className={`group inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-full ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}
