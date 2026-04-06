"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";

function formatTime(d: Date) {
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDayDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function Header() {
  const [now, setNow] = useState(() => new Date());
  const { user, logout } = useAuth();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur-sm transition-colors md:gap-6 md:px-6 md:py-4",
      )}
    >
      <div className="flex min-w-0 flex-1 items-baseline gap-2 md:gap-4">
        <time
          dateTime={now.toISOString()}
          className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground md:text-4xl md:font-medium"
        >
          {formatTime(now)}
        </time>
        <p className="hidden truncate text-sm text-muted sm:block md:text-base">
          {formatDayDate(now)}
        </p>
      </div>
      <p className="truncate text-xs text-muted sm:hidden">{formatDayDate(now)}</p>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "shrink-0 rounded-full border border-border bg-card-hover px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted md:px-3 md:py-1.5 md:text-xs",
          )}
        >
          Late Evening
        </span>
        {user && (
          <div className="flex items-center gap-2 md:hidden">
            <span className="text-xs font-medium text-muted">
              {user.display_name}
            </span>
            <button
              onClick={logout}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-card-hover hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
