"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Camera,
  ChefHat,
  Home,
  Cpu,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { LcarsShell } from "./LcarsShell";
import type { UserRole } from "@/types";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  minRole?: UserRole[];
};

const nav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/cameras", label: "Cameras", icon: Camera },
  { href: "/recipes", label: "Recipes", icon: ChefHat },
  { href: "/devices", label: "Devices", icon: Cpu },
];

const mobileNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/cameras", label: "Cameras", icon: Camera },
  { href: "/recipes", label: "Recipes", icon: ChefHat },
  { href: "/devices", label: "Devices", icon: Cpu },
];

function filterNav(items: NavItem[], role: UserRole): NavItem[] {
  return items.filter((item) => !item.minRole || item.minRole.includes(role));
}

function NavLink({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
        active
          ? "bg-accent/15 text-accent"
          : "text-muted hover:bg-card-hover hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-5 shrink-0 transition-transform duration-200 group-hover:scale-105",
          active && "text-accent",
        )}
      />
      <span>{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const role = user?.role ?? "guest";

  const filteredNav = filterNav(nav, role);
  const filteredMobileNav = filterNav(mobileNav, role);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  if (theme === "lcars") {
    return <LcarsShell>{children}</LcarsShell>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card/50 md:flex lg:w-64">
        <div className="border-b border-border px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Home</p>
          <p className="mt-1 truncate text-lg font-semibold text-foreground">Automation</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {filteredNav.map(({ href, label, icon: Icon }) => (
            <NavLink
              key={href}
              href={href}
              label={label}
              Icon={Icon}
              active={isActive(href)}
            />
          ))}
        </nav>
        {user && (
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-3 rounded-xl px-3 py-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15">
                <User className="size-4 text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {user.display_name}
                </p>
                <p className="truncate text-xs text-muted capitalize">{user.role}</p>
              </div>
              <button
                onClick={logout}
                className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-card-hover hover:text-foreground"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-md md:hidden">
        {filteredMobileNav.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors duration-200",
                active ? "text-accent" : "text-muted hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-6 transition-transform duration-200",
                  active && "scale-110",
                )}
              />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
