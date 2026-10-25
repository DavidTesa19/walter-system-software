// Jarvis can add, move and delete calendar events. An open calendar screen
// listens for this event and reloads, so the change shows without a refresh.
export const CALENDAR_CHANGED_EVENT = 'walter:calendar-changed';

export const announceCalendarChange = () => window.dispatchEvent(new Event(CALENDAR_CHANGED_EVENT));
