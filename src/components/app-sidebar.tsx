import { Link, useRouterState } from "@tanstack/react-router";
import { isSidebarItemActive } from "@/lib/sidebar-active";
import type { Profile, WorkspaceFavorite } from "@/lib/types";
import type { AdminNavigationItem } from "@/lib/admin/types";
import {
  LayoutDashboard,
  Inbox,
  FileText,
  Building2,
  CheckSquare,
  ShieldCheck,
  Bot,
  BarChart3,
  Settings,
  Sparkles,
  LogOut,
  RefreshCw,
  Network,
  CalendarDays,
  ClipboardList,
  Star,
  BadgeCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const todayItems = [{ title: "Revenue Desk", url: "/", icon: LayoutDashboard }];

// Groups follow the lifecycle a relationship actually moves through — acquire, convert,
// deliver, retain — rather than the order these pages happened to be built in. Campaigns
// sat under Convert though it feeds the top of the funnel, and Job Sheets sat there too
// though it is post-acceptance delivery work; both were misfiled against the lifecycle.
const acquireItems = [
  { title: "Leads", url: "/leads", icon: Inbox },
  { title: "Campaigns", url: "/campaigns", icon: CalendarDays },
  { title: "AI Review", url: "/ai-review", icon: Sparkles },
];

const convertItems = [
  { title: "Quotes", url: "/quotes", icon: FileText },
  { title: "Approvals", url: "/approvals", icon: ShieldCheck },
];

const deliverItems = [{ title: "Job Sheets", url: "/job-sheets", icon: ClipboardList }];

const retainItems = [
  { title: "Accounts", url: "/accounts", icon: Building2 },
  { title: "Active Clients", url: "/clients", icon: BadgeCheck },
  { title: "Relationships", url: "/relationships", icon: Network },
  { title: "Renewals", url: "/renewals", icon: RefreshCw },
  { title: "Tasks", url: "/tasks", icon: CheckSquare },
];

const operateItems = [
  // "AI Ops" not "Agents": the page is a control tower over runs, failures and approvals,
  // not a directory of agents. The route id stays /agents — this is a label change only.
  { title: "AI Ops", url: "/agents", icon: Bot },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

type SidebarItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  activePath?: string | null;
};

interface AppSidebarProps {
  profile: Profile | null;
  onSignOut: () => void;
  favorites: Array<Pick<WorkspaceFavorite, "id" | "label" | "href">>;
  adminNavigation?: readonly AdminNavigationItem[];
}

export function AppSidebar({
  profile,
  onSignOut,
  favorites,
  adminNavigation = [],
}: AppSidebarProps) {
  const currentPath = useRouterState({
    select: (s) => s.location.pathname,
  });

  const isActive = (item: SidebarItem) => isSidebarItemActive(item, currentPath);

  // A null label renders the group unlabelled, for single-entry groups where a heading
  // would be redundant chrome above one item.
  const renderGroup = (label: string | null, items: SidebarItem[]) => (
    <SidebarGroup>
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.title}>
                <Link to={item.url}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">Fimmick ClientOps</span>
            <span className="text-[11px] text-muted-foreground">Total CRM + AI Operations</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Today", todayItems)}
        {favorites.length > 0
          ? renderGroup(
              "Favorites",
              favorites.map((favorite) => ({
                title: favorite.label,
                url: favorite.href,
                icon: Star,
              })),
            )
          : null}
        {renderGroup("Acquire", acquireItems)}
        {renderGroup("Convert", convertItems)}
        {renderGroup("Deliver", deliverItems)}
        {renderGroup("Retain & Grow", retainItems)}
        {renderGroup("Operate", operateItems)}
        {adminNavigation.length > 0 ? (
          <>
            {/* A rule rather than a group heading: one entry does not need a section
                label, but admin still needs separating from workflow navigation. */}
            <SidebarSeparator />
            {renderGroup(null, [
              {
                title: "Admin workspace",
                // Point at the first destination this actor is permitted to open so the
                // entry never lands on a page their capabilities exclude.
                url: adminNavigation[0].href,
                icon: UserCog,
                // Keep the entry highlighted across every /admin/* sub-page, which the
                // AdminShell sidebar then navigates.
                activePath: "/admin",
              },
            ])}
          </>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-2 group-data-[collapsible=icon]:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
            {profile?.name?.slice(0, 2).toUpperCase() ?? "??"}
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-xs font-medium">{profile?.name ?? "—"}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {profile?.role ?? "—"} · Fimmick
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onSignOut}
            className="ml-auto h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
