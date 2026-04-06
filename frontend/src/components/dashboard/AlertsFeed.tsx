"use client";

import {
  Plane,
  AlertTriangle,
  Bot,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Alert {
  id: string;
  message: string;
  variant: "danger" | "warning" | "info";
  icon: LucideIcon;
  time: string;
  active: boolean;
}

const DEMO_ALERTS: Alert[] = [
  {
    id: "roborock_water",
    message: "Refill Roborock Water Tank",
    variant: "info",
    icon: Bot,
    time: "11 hours ago",
    active: true,
  },
  {
    id: "dishwasher",
    message: "Dishwasher has not been run",
    variant: "warning",
    icon: AlertTriangle,
    time: "On",
    active: true,
  },
  {
    id: "vacation",
    message: "Vacation Mode is On",
    variant: "info",
    icon: Plane,
    time: "3 days ago",
    active: true,
  },
];

const variantStyles = {
  danger: "border-red-500/30 bg-red-500/5",
  warning: "border-yellow-500/30 bg-yellow-500/5",
  info: "border-blue-500/30 bg-blue-500/5",
};

const iconStyles = {
  danger: "text-red-400",
  warning: "text-yellow-400",
  info: "text-blue-400",
};

export function AlertsFeed() {
  const alerts = DEMO_ALERTS.filter((a) => a.active);

  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
            variantStyles[alert.variant],
          )}
        >
          <alert.icon
            className={cn("size-5 shrink-0", iconStyles[alert.variant])}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {alert.message}
            </p>
            <p className="text-xs text-muted">{alert.time}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
