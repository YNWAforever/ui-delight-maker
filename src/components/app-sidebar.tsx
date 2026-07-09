import { Link, useRouterState } from "@tanstack/react-router";
import type { Profile } from "@/lib/types";
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
} from "@/components/ui/sidebar";

const todayItems = [{ title: "Revenue Desk", url: "/", icon: LayoutDashboard }];

const acquireItems = [
  { title: "Leads", url: "/leads", icon: Inbox },
  { title: "AI Review", url: "/ai-review", icon: Sparkles },
];

const convertItems = [
  { title: "Pipeline", url: "/", icon: LayoutDashboard, activePath: null },
  { title: "Quotes", url: "/quotes", icon: FileText },
  { title: "Job Sheets", url: "/job-sheets", icon: ClipboardList },
  { title: "Approvals", url: "/approvals", icon: ShieldCheck },
  { title: "Campaigns", url: "/campaigns", icon: CalendarDays },
];

const retainItems = [
  { title: "Clients", url: "/clients", icon: Building2 },
  { title: "Relationships", url: "/relationships", icon: Network },
  { title: "Renewals", url: "/renewals", icon: RefreshCw },
  { title: "Tasks", url: "/tasks", icon: CheckSquare },
];

const operateItems = [
  { title: "Agents", url: "/agents", icon: Bot },
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
}

export function AppSidebar({ profile, onSignOut }: AppSidebarProps) {
  const currentPath = useRouterState({
    select: (s) => s.location.pathname,
  });

  const isActive = (item: SidebarItem) => {
    if (item.activePath === null) return false;

    const path = item.activePath ?? item.url;

    if (path === "/") return currentPath === "/";
    return currentPath === path || currentPath.startsWith(path + "/");
  };

  const renderGroup = (label: string, items: SidebarItem[]) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
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
            <span className="text-[11px] text-muted-foreground">Revenue operations desk</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Today", todayItems)}
        {renderGroup("Acquire", acquireItems)}
        {renderGroup("Convert", convertItems)}
        {renderGroup("Retain", retainItems)}
        {renderGroup("Operate", operateItems)}
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
