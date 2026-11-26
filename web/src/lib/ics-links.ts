// Adding an event to any agenda: Google Calendar, Outlook / Microsoft 365, or a one-event
// .ics file that Apple Calendar and every other agenda app opens.

export interface CalendarEvent {
  id: number | string;
  title: string;
  description: string;
  location: string;
  startsAt: number;
  endsAt: number | null;
  url: string;
}

const stamp = (ts: number) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const endOf = (ev: CalendarEvent) => ev.endsAt ?? ev.startsAt + 2 * 3_600_000;
const details = (ev: CalendarEvent) => [ev.description, ev.url].filter(Boolean).join('\n\n');
const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** A one-event .ics file: opens in Apple Calendar and any other agenda app. */
export function buildIcs(ev: CalendarEvent): string {
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//OlimTalk//Events//FR',
      'BEGIN:VEVENT',
      `UID:event-${ev.id}@olimtalk`,
      `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(ev.startsAt)}`,
      `DTEND:${stamp(endOf(ev))}`,
      `SUMMARY:${escapeText(ev.title)}`,
      `DESCRIPTION:${escapeText(details(ev))}`,
      ...(ev.location ? [`LOCATION:${escapeText(ev.location)}`] : []),
      ...(ev.url ? [`URL:${ev.url}`] : []),
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n') + '\r\n'
  );
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates: `${stamp(ev.startsAt)}/${stamp(endOf(ev))}`, details: details(ev), location: ev.location });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** `live` for personal Outlook.com / Hotmail accounts, `office` for Microsoft 365 work or school accounts. */
export function outlookCalendarUrl(ev: CalendarEvent, account: 'live' | 'office'): string {
  const q = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: ev.title,
    startdt: new Date(ev.startsAt).toISOString(),
    enddt: new Date(endOf(ev)).toISOString(),
    body: details(ev),
    location: ev.location,
  });
  return `https://outlook.${account === 'live' ? 'live' : 'office'}.com/calendar/0/deeplink/compose?${q}`;
}
