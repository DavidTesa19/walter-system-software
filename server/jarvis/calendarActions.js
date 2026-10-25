// Jarvis's changes to the user's own calendar.
//
// How careful each step is follows how much it can break:
// - Adding or moving an event happens straight away — asking first would make
//   "dej mi tam schůzku" tedious — and the card it leaves in the conversation
//   has "Vrátit zpět", which removes the event or puts the old one back.
// - Deleting waits for the user's "Smazat" on the card, and even then the
//   event can be restored from the card.
// - An undo never overwrites the user's own later edit: if the event no
//   longer looks as Jarvis left it, the undo stops and says so.
// - A few changes per answer at most, so a misunderstanding cannot sweep a
//   calendar clean.
// Every write goes through the app's own calendar API with the agent token,
// so it only ever touches the user's own events and lands in the change log.

import crypto from 'node:crypto';
import { DAY_MS, eventEndLabel, formatPrague, parseEventTime, pragueParts } from './time.js';

export class CalendarError extends Error {}

export const CALENDAR_LIMITS = { add: 10, update: 10, delete: 5 };

const pad = (value) => String(value).padStart(2, '0');

// "2026-10-30" or "30.10.2026" → "2026-10-30".
export function parseDateInput(text) {
  const value = String(text ?? '').trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const czech = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(value);
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : czech ? [czech[3], czech[2], czech[1]] : [];
  if (!year) throw new CalendarError(`Datum „${value}“ zadej jako 2026-10-30 nebo 30.10.2026.`);
  const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (check.getUTCMonth() !== Number(month) - 1 || check.getUTCDate() !== Number(day)) throw new CalendarError(`Datum ${value} neexistuje.`);
  return `${year}-${pad(month)}-${pad(day)}`;
}

// "9:30", "09.30" → "09:30".
export function parseTimeInput(text) {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(String(text ?? '').trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new CalendarError(`Čas „${text}“ zadej jako 9:30.`);
  return `${pad(match[1])}:${match[2]}`;
}

const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);

// Wall-clock arithmetic on the zone-less "YYYY-MM-DDTHH:MM" the calendar
// form stores (it means Prague time, so no zone conversion belongs here).
const addMinutes = (day, time, minutes) => new Date(Date.parse(`${day}T${time}:00Z`) + minutes * 60000).toISOString().slice(0, 16);

const minutesBetween = (from, to) => Math.round((Date.parse(`${to}:00Z`) - Date.parse(`${from}:00Z`)) / 60000);

/**
 * The stored start / end / allDay for an event, from what Jarvis gives.
 * All-day events store their end as the day after their last day, as the
 * calendar does.
 */
export function buildEventTimes({ date, startTime, endTime, durationMinutes, allDay, endDate }) {
  const day = parseDateInput(date);
  if (allDay || !startTime) {
    const last = endDate ? parseDateInput(endDate) : day;
    if (last < day) throw new CalendarError('Poslední den je před prvním.');
    if ((Date.parse(last) - Date.parse(day)) / DAY_MS > 60) throw new CalendarError('Celodenní událost může trvat nejvýš 60 dní.');
    return { start: day, end: addDays(last, 1), allDay: true };
  }
  const start = `${day}T${parseTimeInput(startTime)}`;
  let end;
  if (endTime) {
    const endDay = endDate ? parseDateInput(endDate) : day;
    end = `${endDay}T${parseTimeInput(endTime)}`;
  } else {
    const minutes = durationMinutes ?? 60;
    if (!(minutes > 0 && minutes <= 24 * 60)) throw new CalendarError('Délka události musí být mezi 1 minutou a 24 hodinami.');
    end = addMinutes(day, start.slice(11), minutes);
  }
  if (end <= start) throw new CalendarError('Konec musí být po začátku.');
  return { start, end, allDay: false };
}

// An event as stored, in the shape Jarvis's cards keep and compare.
export const snapshot = (event) => ({
  title: event.title ?? '',
  start: event.start ?? null,
  end: event.end ?? null,
  allDay: Boolean(event.allDay),
  description: event.description ?? '',
});

// Whether the event still looks as a card left it (times compared as
// instants, so "…T10:00" and its offset form are the same).
export function sameEvent(left, right) {
  if (!left || !right) return false;
  const time = (value) => (value ? parseEventTime(value).getTime() : null);
  return (
    String(left.title ?? '') === String(right.title ?? '') &&
    String(left.description ?? '') === String(right.description ?? '') &&
    Boolean(left.allDay) === Boolean(right.allDay) &&
    time(left.start) === time(right.start) &&
    time(left.end ?? left.start) === time(right.end ?? right.start)
  );
}

// When an event happens, as people read it.
export function describeWhen(event) {
  const start = formatPrague(typeof event.start === 'string' && event.allDay ? event.start : parseEventTime(event.start), { dateOnly: event.allDay });
  const end = eventEndLabel(event, event.allDay);
  if (!end) return event.allDay ? `${start} (celý den)` : start;
  if (!event.allDay && end.slice(0, -6) === start.slice(0, -6)) return `${start}–${end.slice(-5)}`;
  return `${start} – ${end}`;
}

// The parts of an event a person cares about, for the old → new rows.
function changeRows(before, after) {
  const rows = [];
  if (before.title !== after.title) rows.push({ label: 'Název', fromText: before.title || '—', toText: after.title || '—' });
  const beforeWhen = describeWhen(before);
  const afterWhen = describeWhen(after);
  if (beforeWhen !== afterWhen) rows.push({ label: 'Kdy', fromText: beforeWhen, toText: afterWhen });
  if ((before.description ?? '') !== (after.description ?? '')) {
    rows.push({ label: 'Popis', fromText: before.description || '—', toText: after.description || '—' });
  }
  return rows;
}

/**
 * The new times for an event being edited: what is given replaces, the rest
 * stays — a moved meeting keeps its length.
 */
export function editedTimes(event, { date, startTime, endTime, allDay }) {
  const wasAllDay = Boolean(event.allDay);
  const nextAllDay = allDay ?? wasAllDay;
  const start = parseEventTime(event.start);
  const parts = pragueParts(start);
  const currentDay = wasAllDay && /^\d{4}-\d{2}-\d{2}/.test(event.start) ? event.start.slice(0, 10) : `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  const day = date ? parseDateInput(date) : currentDay;

  if (nextAllDay) {
    // Keep the number of days, moved to the new first day.
    const days = wasAllDay && event.end ? Math.max(1, Math.round((Date.parse(String(event.end).slice(0, 10)) - Date.parse(currentDay)) / DAY_MS)) : 1;
    return { start: day, end: addDays(day, days), allDay: true };
  }

  const currentStart = wasAllDay ? null : `${pad(parts.hour)}:${pad(parts.minute)}`;
  const nextStart = startTime ? parseTimeInput(startTime) : currentStart;
  if (!nextStart) throw new CalendarError('Celodenní událost převádíš na časovou – zadej začátek (start_time).');
  let length = 60;
  if (!wasAllDay && event.end) {
    const endParts = pragueParts(parseEventTime(event.end));
    const currentEnd = `${endParts.year}-${pad(endParts.month)}-${pad(endParts.day)}T${pad(endParts.hour)}:${pad(endParts.minute)}`;
    length = Math.max(1, minutesBetween(`${currentDay}T${currentStart}`, currentEnd));
  }
  return buildEventTimes({ date: day, startTime: nextStart, endTime: endTime ?? undefined, durationMinutes: endTime ? undefined : length });
}

// ---------------------------------------------------------------------------
// Talking to the calendar API.
// ---------------------------------------------------------------------------

export async function findEvent(api, eventId) {
  const events = await api.request('GET', '/api/calendar-events');
  return (Array.isArray(events) ? events : []).find((event) => Number(event.id) === Number(eventId)) ?? null;
}

export async function listEvents(api) {
  const events = await api.request('GET', '/api/calendar-events');
  return Array.isArray(events) ? events : [];
}

// Events whose time overlaps the given one — worth a mention, not a refusal.
export function overlapping(events, target, ignoreId = null) {
  const startOf = (event) => parseEventTime(event.start).getTime();
  const endOf = (event) => (event.end ? parseEventTime(event.end).getTime() : startOf(event) + (event.allDay ? DAY_MS : 3600000));
  const from = startOf(target);
  const to = endOf(target);
  return events.filter((event) => Number(event.id) !== Number(ignoreId) && event.start && startOf(event) < to && endOf(event) > from);
}

// The card a calendar change leaves in the conversation.
export function calendarCard(action, { event, before, after, reason, overlaps }) {
  const shown = after ?? before;
  return {
    id: crypto.randomUUID(),
    action,
    eventId: Number(event.id),
    title: shown.title || 'Bez názvu',
    when: describeWhen(shown),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(action === 'update' ? { changes: changeRows(before, after) } : {}),
    ...(overlaps?.length ? { overlaps: overlaps.slice(0, 5).map((item) => `${item.title || 'Bez názvu'} (${describeWhen(snapshot(item))})`) } : {}),
    ...(reason ? { reason: String(reason).slice(0, 300) } : {}),
    createdAt: new Date().toISOString(),
  };
}

// A card's state: its last decision, or where it started.
export function cardState(card, statuses) {
  const own = statuses.filter((item) => item.id === card.id);
  if (own.length) return own[own.length - 1].status;
  return card.action === 'delete' ? 'pending' : 'done';
}

const STATE_ACTIONS = {
  // state → the buttons that apply to it
  done: ['undo'],
  pending: ['confirm', 'keep'],
  deleted: ['undo'],
};

/**
 * Carry out the user's click on a calendar card. Returns the new status item
 * fields ({ status, error?, eventId? }).
 */
export async function decideCalendarCard(card, state, action, api) {
  if (!(STATE_ACTIONS[state] ?? []).includes(action)) throw new CalendarError('Tohle tlačítko už u této karty neplatí.');

  if (action === 'keep') return { status: 'kept' };

  if (action === 'confirm') {
    const current = await findEvent(api, card.eventId);
    if (!current) return { status: 'gone', error: 'Událost už v kalendáři není.' };
    if (!sameEvent(snapshot(current), card.before)) {
      return { status: 'changed', error: 'Událost se mezitím změnila, nesmazal jsem ji. Požádejte Jarvise znovu.' };
    }
    await api.request('DELETE', `/api/calendar-events/${card.eventId}`);
    return { status: 'deleted' };
  }

  // Undo.
  if (card.action === 'delete') {
    const restored = await api.request('POST', '/api/calendar-events', {
      title: card.before.title,
      start: card.before.start,
      end: card.before.end,
      allDay: card.before.allDay,
      description: card.before.description,
    });
    return { status: 'restored', eventId: Number(restored?.id) || undefined };
  }
  const current = await findEvent(api, card.eventId);
  if (!current) return { status: 'gone', error: 'Událost už v kalendáři není.' };
  if (!sameEvent(snapshot(current), card.after)) {
    return { status: 'changed', error: 'Událost jste mezitím upravili, vrácení by vaše úpravy přepsalo – nechal jsem ji být.' };
  }
  if (card.action === 'create') {
    await api.request('DELETE', `/api/calendar-events/${card.eventId}`);
    return { status: 'undone' };
  }
  // The calendar API keeps a field it is sent as null, so an empty end goes
  // back as the start (the calendar shows such an event at its start time).
  await api.request('PUT', `/api/calendar-events/${card.eventId}`, {
    title: card.before.title,
    start: card.before.start,
    end: card.before.end ?? card.before.start,
    allDay: card.before.allDay,
    description: card.before.description,
  });
  return { status: 'undone' };
}

const OUTCOME_TEXT = {
  undone: 'uživatel vrátil zpět',
  deleted: 'uživatel potvrdil, smazáno',
  kept: 'uživatel ponechal, nesmazáno',
  restored: 'uživatel smazání vrátil, událost je zpět',
  changed: 'neprovedeno – událost se mezitím změnila',
  gone: 'událost už v kalendáři není',
  failed: 'nepodařilo se',
};

const ACTION_TEXT = { create: 'přidání', update: 'úprava', delete: 'smazání' };

// What became of Jarvis's calendar cards since the user's last message, and
// which deletions still wait — for the next turn's <kontext>.
export function calendarOutcomes(transcript = []) {
  const lastQuestion = transcript.map((item) => item.type).lastIndexOf('question');
  const cards = transcript.filter((item) => item.type === 'calendar' && item.card).map((item) => item.card);
  const statuses = transcript.filter((item) => item.type === 'calendar_status');
  const lines = [];
  transcript.forEach((item, index) => {
    if (item.type !== 'calendar_status' || index <= lastQuestion) return;
    const card = cards.find((entry) => entry.id === item.id);
    if (card) lines.push(`Kalendář, ${ACTION_TEXT[card.action]} „${card.title}“ (${card.when}): ${OUTCOME_TEXT[item.status] ?? item.status}${item.error ? ` (${item.error})` : ''}`);
  });
  for (const card of cards) {
    if (card.action === 'delete' && cardState(card, statuses) === 'pending') {
      lines.push(`Kalendář, smazání „${card.title}“ (${card.when}): stále čeká na potvrzení`);
    }
  }
  return lines.slice(-12);
}
