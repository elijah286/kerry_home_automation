"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Camera,
  ChefHat,
  Home,
  Cpu,
  Settings,
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/cameras", label: "Cameras", icon: Camera },
  { href: "/recipes", label: "Recipes", icon: ChefHat },
  { href: "/devices", label: "Devices", icon: Cpu },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const mobileNav = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/cameras", label: "Cameras", icon: Camera },
  { href: "/recipes", label: "Recipes", icon: ChefHat },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const NAV_COLORS = [
  "#FF9900",
  "#CC99CC",
  "#9999CC",
  "#FFCC99",
  "#CC6699",
];

const MOBILE_NAV_COLORS = [
  "#FF9900",
  "#CC99CC",
  "#9999FF",
  "#FFCC00",
];

function formatStardate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(year, 0, 1);
  const dayOfYear =
    Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
  const base = 47000 + (year - 2020);
  const fraction = Math.floor((dayOfYear / 365.25) * 10);
  return `${base}.${fraction}`;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function LcarsNavPill({
  href,
  label,
  Icon,
  color,
  active,
}: {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  color: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`lcars-nav-pill ${active ? "lcars-nav-active" : ""}`}
      style={{
        backgroundColor: active ? "#FFFFFF" : color,
      }}
    >
      <Icon className="lcars-nav-icon" />
      <span className="lcars-nav-label">{label}</span>
    </Link>
  );
}

export function LcarsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="lcars-frame">
      {/* ═══ TOP BRACKET (desktop) ═══ */}
      <div className="lcars-bracket-top">
        <div className="lcars-cap-top">
          <span className="lcars-cap-title">Home</span>
          <span className="lcars-cap-subtitle">Automation</span>
        </div>
        <div className="lcars-header-area">
          <div className="lcars-header-row">
            <div className="lcars-header-main">
              <time className="lcars-time" dateTime={now.toISOString()}>
                {formatTime(now)}
              </time>
              <span className="lcars-date">{formatDate(now).toUpperCase()}</span>
            </div>
            <div className="lcars-header-seg" style={{ background: "#9999FF", width: 60 }} />
            <div className="lcars-header-seg" style={{ background: "#FFCC00", width: 32 }} />
            <div className="lcars-header-seg" style={{ background: "#FFCC99", width: 48 }} />
            <div className="lcars-header-seg lcars-header-seg-end" style={{ background: "#9999CC" }} />
          </div>
        </div>
      </div>

      {/* ═══ MOBILE HEADER ═══ */}
      <div className="lcars-mobile-header">
        <time className="lcars-mobile-time" dateTime={now.toISOString()}>
          {formatTime(now)}
        </time>
        <span className="lcars-mobile-date">{formatDate(now).toUpperCase()}</span>
      </div>

      {/* ═══ BODY: SIDEBAR + CONTENT ═══ */}
      <div className="lcars-body">
        <nav className="lcars-sidebar">
          {nav.map(({ href, label, icon: Icon }, i) => (
            <LcarsNavPill
              key={href}
              href={href}
              label={label}
              Icon={Icon}
              color={NAV_COLORS[i % NAV_COLORS.length]}
              active={isActive(href)}
            />
          ))}
          <div className="lcars-sidebar-filler" />
        </nav>

        <main className="lcars-content">
          {children}
        </main>
      </div>

      {/* ═══ BOTTOM BRACKET (desktop) ═══ */}
      <div className="lcars-bracket-bottom">
        <div className="lcars-cap-bottom">
          <span className="lcars-stardate">{formatStardate()}</span>
        </div>
        <div className="lcars-footer-area">
          <div className="lcars-footer-row">
            <div className="lcars-footer-seg" style={{ background: "#CC99CC", width: 100 }} />
            <div className="lcars-footer-seg" style={{ background: "#9999FF", width: 48 }} />
            <div className="lcars-footer-seg" style={{ background: "#FF9900", width: 64 }} />
            <div className="lcars-footer-seg" style={{ background: "#FFCC00", width: 32 }} />
            <div className="lcars-footer-seg lcars-footer-seg-fill" style={{ background: "#9999CC" }} />
          </div>
        </div>
      </div>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      <nav className="lcars-mobile-nav">
        {mobileNav.map(({ href, label, icon: Icon }, i) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`lcars-mobile-pill ${active ? "lcars-mobile-active" : ""}`}
              style={{
                backgroundColor: active ? "#FFFFFF" : MOBILE_NAV_COLORS[i],
              }}
            >
              <Icon className="lcars-mobile-icon" />
              <span className="lcars-mobile-label">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
