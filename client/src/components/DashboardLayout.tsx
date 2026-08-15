import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { BriefcaseBusiness, Building2, LayoutDashboard, LogOut, PanelLeft, Quote, UsersRound } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: UsersRound, label: "Leads", path: "/leads" },
  { icon: Building2, label: "Companies", path: "/companies" },
  { icon: BriefcaseBusiness, label: "Follow-ups", path: "/follow-ups" },
  { icon: Quote, label: "Quotes", path: "/quotes" },
];

const SIDEBAR_WIDTH_KEY = "soloflow-sidebar-width";
const DEFAULT_WIDTH = 264;
const MIN_WIDTH = 220;
const MAX_WIDTH = 360;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_15%_8%,hsl(var(--primary)/0.13),transparent_24rem),radial-gradient(circle_at_82%_82%,hsl(var(--accent)/0.18),transparent_28rem)] px-4 py-10">
        <div className="absolute inset-0 grid-pattern opacity-50" aria-hidden="true" />
        <section className="relative w-full max-w-md rounded-[1.75rem] border border-white/80 bg-white/90 p-8 shadow-[0_24px_70px_-32px_rgba(20,45,66,0.35)] backdrop-blur sm:p-10">
          <div className="mb-8 flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="font-display text-lg font-semibold tracking-[-0.04em] text-slate-900">solo•flow</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Client intelligence</p>
            </div>
          </div>
          <span className="inline-flex rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">Private workspace</span>
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-[-0.045em] text-slate-950">Keep every next step in view.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Sign in to manage your leads, client context, follow-ups, and quotes in one focused place.</p>
          <Button onClick={() => startLogin()} size="lg" className="mt-8 w-full rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            Sign in to your workspace
          </Button>
          <p className="mt-4 text-center text-xs text-slate-500">Your CRM data is visible only within your authenticated workspace.</p>
        </section>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function BrandMark() {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20" aria-hidden="true">
      <span className="relative block h-4 w-5 rounded-sm border-2 border-current after:absolute after:-right-1 after:-top-1 after:h-2 after:w-2 after:rounded-sm after:border-2 after:border-current" />
    </span>
  );
}

function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const activeItem = menuItems.find(item => item.path === location) ?? menuItems[0];

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (event: MouseEvent) => {
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const nextWidth = event.clientX - left;
      if (nextWidth >= MIN_WIDTH && nextWidth <= MAX_WIDTH) setSidebarWidth(nextWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div ref={sidebarRef} className="relative">
        <Sidebar collapsible="icon" className="border-r border-slate-200/80 bg-[#f8fafb]" disableTransition={isResizing}>
          <SidebarHeader className="h-[5.15rem] border-b border-slate-200/70 px-3 py-3">
            <div className="flex h-full items-center gap-3">
              <button onClick={toggleSidebar} className="rounded-xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Toggle navigation">
                <BrandMark />
              </button>
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="font-display text-lg font-semibold tracking-[-0.04em] text-slate-950">solo•flow</p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Client intelligence</p>
                </div>
              )}
            </div>
          </SidebarHeader>
          <SidebarContent className="px-3 py-5">
            {!isCollapsed && <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p>}
            <SidebarMenu className="gap-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      onClick={() => setLocation(item.path)}
                      className="h-11 rounded-xl px-3 text-slate-600 transition-[background-color,color,transform] duration-150 hover:-translate-y-px hover:bg-white hover:text-slate-950 data-[active=true]:bg-primary data-[active=true]:font-semibold data-[active=true]:text-primary-foreground data-[active=true]:shadow-md data-[active=true]:shadow-primary/15"
                    >
                      <item.icon className="h-4.5 w-4.5" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="border-t border-slate-200/70 p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center">
                  <Avatar className="h-9 w-9 border border-slate-200 bg-white">
                    <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{user?.name?.slice(0, 1).toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <span className="block truncate text-sm font-semibold text-slate-800">{user?.name || "Your workspace"}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{user?.email || "Authenticated user"}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5">
                <DropdownMenuItem onClick={logout} className="cursor-pointer rounded-lg text-destructive focus:bg-destructive/10 focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        {!isCollapsed && <div className="absolute inset-y-0 right-0 z-50 w-1 cursor-col-resize transition-colors hover:bg-primary/30" onMouseDown={() => setIsResizing(true)} aria-hidden="true" />}
      </div>
      <SidebarInset className="bg-[#f4f7f8]">
        {isMobile && (
          <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur">
            <SidebarTrigger className="rounded-xl" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
              <h2 className="font-display text-base font-semibold text-slate-900">{activeItem.label}</h2>
            </div>
          </header>
        )}
        <main className="min-h-screen px-4 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-9">{children}</main>
      </SidebarInset>
    </>
  );
}
