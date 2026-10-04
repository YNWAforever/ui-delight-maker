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
    // A rail only from 2xl. Beside the app sidebar a second 224 px rail left admin pages about
    // 800 px at 1280, and the audit history ran to 1,452 px (UX-12); below 2xl the same links
    // are a row of tabs above the page.
    <div className="flex min-h-full min-w-0 flex-col 2xl:flex-row">
      <aside className="border-b border-border bg-muted/20 2xl:w-56 2xl:shrink-0 2xl:border-b-0 2xl:border-r">
        {/*
          Deliberately not a heading. Every admin page now opens with a `WorkspaceHeader`
          whose title is the page's single h1, and this rail sits *before* it in the
          document — so an `h1` here gave every admin screen two, and an `h2` here would
          have put a subheading above the heading it belongs under. The rail is labelled
          for assistive technology by the `aria-label` on its `nav`, which is what a
          landmark needs; the text below is the visible name of that landmark.
        */}
        <div className="flex items-baseline gap-3 px-4 pt-3 md:px-6 2xl:block 2xl:px-4 2xl:py-5">
          <p className="hidden text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground 2xl:block">
            Control plane
          </p>
          <p className="text-sm font-semibold tracking-tight text-foreground 2xl:mt-1 2xl:text-lg">
            Admin workspace
          </p>
          <p className="hidden text-xs leading-5 text-muted-foreground 2xl:mt-1 2xl:block">
            People, teams, access, and audit.
          </p>
        </div>
        <nav aria-label="Admin navigation" className="px-2 py-2 md:px-4 2xl:px-2 2xl:pb-5 2xl:pt-0">
          <div className="flex gap-1 overflow-x-auto 2xl:flex-col 2xl:overflow-visible">
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
                  className={`group inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring 2xl:w-full ${
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
