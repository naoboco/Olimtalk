// Calendars, the provider-neutral way: the iCalendar format (.ics) is understood by
// Google Calendar, Outlook / Microsoft 365, Apple Calendar and practically every agenda.
import ICAL from 'ical.js';

export interface AgendaItem {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location: string;
  /** Name the person gave to the calendar it comes from. */
  calendar: string;
}

/**
 * Read the events of an .ics file that fall between `from` and `to` (timestamps).
 * Repeating events are expanded into their individual occurrences.
 */
export function parseIcs(text: string, calendar: string, from: number, to: number): AgendaItem[] {
  const root = new ICAL.Component(ICAL.parse(text));
  // Events may be expressed in time zones the file defines itself.
  for (const zone of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(zone);

  const main = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const component of root.getAllSubcomponents('vevent')) {
    if (String(component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') continue;
    const event = new ICAL.Event(component);
    if (event.isRecurrenceException()) exceptions.push(event);
    else main.set(event.uid || `event-${main.size}`, event);
  }
  // A moved or edited occurrence of a repeating event replaces the regular one.
  for (const exception of exceptions) main.get(exception.uid)?.relateException(exception);

  const items: AgendaItem[] = [];
  const add = (uid: string, title: string, location: string, startTime: ICAL.Time, endTime: ICAL.Time) => {
    const start = startTime.toJSDate().getTime();
    const end = Math.max(endTime.toJSDate().getTime(), start);
    if (end < from || start > to) return;
    items.push({ id: `${calendar}:${uid}:${start}`, title: title || '—', start, end, allDay: startTime.isDate, location: location || '', calendar });
  };

  for (const [uid, event] of main) {
    if (!event.startDate) continue;
    if (!event.isRecurring()) {
      add(uid, event.summary, event.location, event.startDate, event.endDate ?? event.startDate);
      continue;
    }
    // Walk the occurrences in order; those that ended before the period are skipped cheaply.
    const length = event.duration.toSeconds() * 1000;
    const occurrences = event.iterator();
    for (let n = 0; n < 50_000; n++) {
      const next = occurrences.next();
      if (!next) break;
      const at = next.toJSDate().getTime();
      if (at > to) break;
      if (at + length < from) continue;
      const detail = event.getOccurrenceDetails(next);
      add(uid, detail.item.summary, detail.item.location, detail.startDate, detail.endDate);
    }
  }
  return items.sort((a, b) => a.start - b.start);
}

// The link builders live in a lighter file, so screens that only add an event do not load this reader.
export * from './ics-links.ts';
