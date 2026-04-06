"use client";

import { Cloud, Sun, CloudRain } from "lucide-react";
import { Card } from "@/components/ui/Card";

const FORECAST = [
  { day: "Sun", high: 66, low: 59, icon: Cloud },
  { day: "Mon", high: 72, low: 55, icon: Sun },
  { day: "Tue", high: 73, low: 54, icon: Sun },
  { day: "Wed", high: 74, low: 58, icon: CloudRain },
  { day: "Thu", high: 77, low: 61, icon: Sun },
];

export function WeatherCard() {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Cloud className="size-10 text-blue-300" />
          <div>
            <p className="text-sm text-muted">Forecast Home</p>
            <p className="text-lg font-semibold text-foreground">Partly Cloudy</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-foreground">66°F</p>
          <p className="text-xs text-muted">66°F / 59°F</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        {FORECAST.map((day) => (
          <div key={day.day} className="flex flex-col items-center gap-1">
            <span className="text-xs font-medium text-muted">{day.day}</span>
            <day.icon className="size-5 text-yellow-400" />
            <span className="text-xs font-semibold text-foreground">{day.high}°</span>
            <span className="text-xs text-muted">{day.low}°</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
