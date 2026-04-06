"use client";

import { Sun, Home, Battery, Zap } from "lucide-react";
import { Card } from "@/components/ui/Card";

export function EnergyFlowCard() {
  const solar = 9.0;
  const battery = 30;
  const house = 13.1;
  const grid = 0.01;
  const percentSolar = 20;

  return (
    <Card className="relative overflow-hidden">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Powerwall</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-foreground">30.0</span>
          <span className="text-xs text-muted">Peak</span>
          <span className="text-lg font-bold text-accent">29</span>
          <span className="text-xs text-muted">Current</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-14 items-center justify-center rounded-full bg-yellow-500/10">
            <Sun className="size-7 text-yellow-400" />
          </div>
          <span className="text-lg font-bold text-yellow-400">{solar} kW</span>
          <span className="text-xs text-muted">Solar</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="relative flex size-14 items-center justify-center rounded-full bg-blue-500/10">
            <Home className="size-7 text-blue-400" />
            <div className="absolute inset-0 rounded-full border-2 border-blue-400/30 animate-ping opacity-30" />
          </div>
          <span className="text-lg font-bold text-blue-400">{house} kW</span>
          <span className="text-xs text-muted">House</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex size-14 items-center justify-center rounded-full bg-green-500/10">
            <Battery className="size-7 text-green-400" />
          </div>
          <span className="text-lg font-bold text-green-400">{battery}%</span>
          <span className="text-xs text-muted">Battery</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-xs text-muted">Solar → House</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-muted">Battery → House</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-gray-500" />
          <span className="text-xs text-muted">Grid: {grid} kW</span>
        </div>
        <div className="rounded-full bg-green-500/10 px-3 py-1">
          <span className="text-sm font-semibold text-green-400">
            {percentSolar}% Solar
          </span>
        </div>
      </div>
    </Card>
  );
}
