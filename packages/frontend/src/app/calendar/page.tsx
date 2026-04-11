'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlarmClock,
  CookingPot,
} from 'lucide-react';
import { getAlarms, getPaprikaMeals } from '@/lib/api';
import type { Alarm, PaprikaMeal } from '@ha/shared';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface CalendarEvent {
  type: 'alarm' | 'meal';
  label: string;
  time?: string;
  detail?: string;
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const DAY_ABBREVS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EVENT_COLORS: Record<string, string> = {
  alarm: 'var(--color-accent)',
  meal: 'var(--color-success)',
};

const MEAL_TYPE_LABELS: Record<number, string> = {
  0: 'Breakfast',
  1: 'Lunch',
  2: 'Dinner',
  3: 'Snack',
};

export default function CalendarPage() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [meals, setMeals] = useState<PaprikaMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(
    dateKey(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [alarmRes, mealRes] = await Promise.all([
        getAlarms(),
        getPaprikaMeals(),
      ]);
      setAlarms(alarmRes.alarms);
      setMeals(mealRes.meals);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Build events map for the current month
  const eventsMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();

    const addEvent = (key: string, event: CalendarEvent) => {
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    };

    // Alarms: recurring by day-of-week across the month
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    for (const alarm of alarms) {
      if (!alarm.enabled) continue;
      for (let day = 1; day <= daysInMonth; day++) {
        const dow = new Date(viewYear, viewMonth, day).getDay();
        if (alarm.daysOfWeek.includes(dow)) {
          const key = dateKey(viewYear, viewMonth, day);
          addEvent(key, {
            type: 'alarm',
            label: alarm.name,
            time: alarm.time,
          });
        }
      }
    }

    // Meals
    for (const meal of meals) {
      addEvent(meal.date, {
        type: 'meal',
        label: meal.name,
        detail: MEAL_TYPE_LABELS[meal.type] ?? 'Meal',
      });
    }

    return map;
  }, [alarms, meals, viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  const goToday = () => {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    setSelectedDate(dateKey(t.getFullYear(), t.getMonth(), t.getDate()));
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDow = getFirstDayOfWeek(viewYear, viewMonth);
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const selectedEvents = selectedDate ? eventsMap.get(selectedDate) ?? [] : [];

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-4 lg:p-6 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-accent)' }} />
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading calendar...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}>
            <CalendarDays className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          </div>
          <h1 className="text-lg font-semibold">Calendar</h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={goToday} className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
            Today
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EVENT_COLORS.alarm }} />
          Alarms
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EVENT_COLORS.meal }} />
          Meals
        </span>
      </div>

      {error && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-danger)', color: '#fff' }}>
          {error}
        </div>
      )}

      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Calendar grid */}
        <Card className="flex-1 !p-0">
          {/* Month nav */}
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <button onClick={prevMonth} className="p-1 rounded-md hover:bg-[var(--color-bg-hover)]">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} className="p-1 rounded-md hover:bg-[var(--color-bg-hover)]">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--color-border)' }}>
            {DAY_ABBREVS.map((d) => (
              <div key={d} className="py-2 text-center text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {/* Empty cells before first day */}
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`e-${i}`} className="h-16 border-b border-r" style={{ borderColor: 'var(--color-border)' }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const key = dateKey(viewYear, viewMonth, day);
              const events = eventsMap.get(key) ?? [];
              const isToday = key === todayKey;
              const isSelected = key === selectedDate;
              const alarmCount = events.filter((e) => e.type === 'alarm').length;
              const mealCount = events.filter((e) => e.type === 'meal').length;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(key)}
                  className="h-16 border-b border-r p-1 text-left transition-colors hover:bg-[var(--color-bg-hover)] relative"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: isSelected ? 'var(--color-bg-secondary)' : undefined,
                  }}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${isToday ? 'text-white' : ''}`}
                    style={isToday ? { backgroundColor: 'var(--color-accent)' } : { color: 'var(--color-text)' }}
                  >
                    {day}
                  </span>
                  {events.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5 ml-0.5">
                      {alarmCount > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: EVENT_COLORS.alarm }} />
                      )}
                      {mealCount > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: EVENT_COLORS.meal }} />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Day detail sidebar */}
        <div className="lg:w-72 shrink-0 space-y-2">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            {selectedDate
              ? new Date(selectedDate + 'T12:00:00').toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })
              : 'Select a day'}
          </h2>

          {selectedEvents.length === 0 ? (
            <p className="text-xs py-4" style={{ color: 'var(--color-text-muted)' }}>
              No events on this day
            </p>
          ) : (
            selectedEvents
              .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
              .map((event, i) => (
                <Card key={i} className="!p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: EVENT_COLORS[event.type] }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{event.label}</p>
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {event.time && <span>{formatTime12(event.time)}</span>}
                        {event.detail && <span>{event.detail}</span>}
                        <span className="flex items-center gap-0.5">
                          {event.type === 'alarm' ? <AlarmClock className="h-3 w-3" /> : <CookingPot className="h-3 w-3" />}
                          {event.type === 'alarm' ? 'Alarm' : 'Meal'}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
