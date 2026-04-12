// ---------------------------------------------------------------------------
// Minimal RFC 5545 ICS parser for VEVENT (GameChanger / SportsEngine feeds)
// ---------------------------------------------------------------------------

import type { IcalCalendarEvent } from '@ha/shared';

/** Unfold folded lines, normalize newlines */
function normalizeIcs(raw: string): string {
  let t = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  t = t.replace(/\n[ \t]/g, '');
  return t;
}

function veventProp(block: string, prop: string): string | null {
  const re = new RegExp(`^${prop}(?:;[^:\n]*)?:([^\\n]+)`, 'im');
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

function parseDateOrDatetime(value: string): { allDay: boolean; iso: string } {
  const v = value.trim();
  if (/^\d{8}$/.test(v)) {
    const y = v.slice(0, 4);
    const mo = v.slice(4, 6);
    const d = v.slice(6, 8);
    return { allDay: true, iso: `${y}-${mo}-${d}` };
  }
  if (/^\d{8}T\d{6}Z?$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const mo = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    const hh = Number(v.slice(9, 11));
    const mm = Number(v.slice(11, 13));
    const ss = Number(v.slice(13, 15));
    const utc = v.endsWith('Z');
    if (utc) {
      const dt = new Date(Date.UTC(y, mo, d, hh, mm, ss));
      return { allDay: false, iso: dt.toISOString() };
    }
    const dt = new Date(y, mo, d, hh, mm, ss);
    return { allDay: false, iso: dt.toISOString() };
  }
  const tryDate = new Date(v);
  if (!Number.isNaN(+tryDate)) return { allDay: false, iso: tryDate.toISOString() };
  return { allDay: true, iso: v };
}

export function parseIcsToEvents(text: string): IcalCalendarEvent[] {
  const body = normalizeIcs(text);
  const out: IcalCalendarEvent[] = [];
  const re = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const block = m[1];
    const uid = veventProp(block, 'UID') ?? `gen-${out.length}-${Date.now()}`;
    const summary = veventProp(block, 'SUMMARY') ?? '(no title)';
    const loc = veventProp(block, 'LOCATION') ?? undefined;

    const dtStartRaw = veventProp(block, 'DTSTART');
    if (!dtStartRaw) continue;

    const startLine = block.match(/^DTSTART[^\n]*/im)?.[0] ?? `DTSTART:${dtStartRaw}`;
    const allDayFromProp = /VALUE=DATE/i.test(startLine);

    let allDay = allDayFromProp;
    let startIso: string;
    if (allDayFromProp && /^\d{8}$/.test(dtStartRaw)) {
      const y = dtStartRaw.slice(0, 4);
      const mo = dtStartRaw.slice(4, 6);
      const d = dtStartRaw.slice(6, 8);
      startIso = `${y}-${mo}-${d}`;
    } else {
      const p = parseDateOrDatetime(dtStartRaw);
      allDay = p.allDay;
      startIso = p.iso;
    }

    let endIso: string | undefined;
    const dtEndRaw = veventProp(block, 'DTEND');
    if (dtEndRaw) {
      const endLine = block.match(/^DTEND[^\n]*/im)?.[0] ?? `DTEND:${dtEndRaw}`;
      const endAllDay = /VALUE=DATE/i.test(endLine);
      if (endAllDay && /^\d{8}$/.test(dtEndRaw)) {
        const y = dtEndRaw.slice(0, 4);
        const mo = dtEndRaw.slice(4, 6);
        const d = dtEndRaw.slice(6, 8);
        endIso = `${y}-${mo}-${d}`;
      } else {
        endIso = parseDateOrDatetime(dtEndRaw).iso;
      }
    }

    out.push({
      uid,
      summary: summary.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' '),
      start: startIso,
      end: endIso,
      allDay,
      location: loc?.replace(/\\,/g, ','),
    });
  }
  return out;
}
