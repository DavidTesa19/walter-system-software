// Dates in Prague time: the calendar's days start at Prague midnight whatever
// the server's own time zone (UTC on Railway). Used by the calendar tool that
// reads events and by the tools that add, move and delete them.

export const PRAGUE = 'Europe/Prague';
export const DAY_MS = 24 * 3600 * 1000;

export function pragueParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PRAGUE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

// The instant a Prague wall-clock time happens (midnight by default).
export function pragueTime({ year, month, day, hour = 0, minute = 0 }) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const local = pragueParts(new Date(guess));
  const offset = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - guess;
  return new Date(guess - offset);
}

export const pragueMidnight = (day) => pragueTime(day);

export function parseDay(text) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const czech = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(text);
  return { year: Number(czech[3]), month: Number(czech[2]), day: Number(czech[1]) };
}

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const FLOATING_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

// A calendar time as stored: a date (all-day), a time with an offset (dragged
// in the calendar), or a bare "2026-10-20T10:00" from the event form, which
// means Prague time — not the server's UTC.
export function parseEventTime(value) {
  if (typeof value === 'string') {
    if (DATE_ONLY.test(value)) return pragueMidnight(parseDay(value));
    const floating = FLOATING_TIME.exec(value);
    if (floating) {
      const [, year, month, day, hour, minute] = floating.map(Number);
      return pragueTime({ year, month, day, hour, minute });
    }
  }
  return new Date(value);
}

export function formatPrague(value, { dateOnly = false } = {}) {
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const { year, month, day } = parseDay(value);
    return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('cs-CZ', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' });
  }
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('cs-CZ', {
    timeZone: PRAGUE,
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit' }),
  });
}

// An all-day event's stored end is the day after its last day (as the
// calendar keeps it); people mean the last day. A one-day event has no end.
export function eventEndLabel(event, allDay) {
  if (!event.end) return undefined;
  if (allDay && typeof event.end === 'string' && DATE_ONLY.test(event.end)) {
    const { year, month, day } = parseDay(event.end);
    const last = new Date(Date.UTC(year, month - 1, day) - DAY_MS).toISOString().slice(0, 10);
    return last <= String(event.start).slice(0, 10) ? undefined : formatPrague(last);
  }
  return formatPrague(parseEventTime(event.end), { dateOnly: allDay });
}
