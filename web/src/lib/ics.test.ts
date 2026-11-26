import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIcs, googleCalendarUrl, outlookCalendarUrl, parseIcs } from './ics.ts';

const day = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min);

const CALENDAR = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'BEGIN:VTIMEZONE',
  'TZID:Asia/Jerusalem',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0200',
  'TZNAME:IST',
  'DTSTART:19701025T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0300',
  'TZNAME:IDT',
  'DTSTART:19700327T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1FR',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
  // one-off, in UTC
  'BEGIN:VEVENT',
  'UID:bank@example',
  'DTSTART:20310112T090000Z',
  'DTEND:20310112T093000Z',
  'SUMMARY:Rendez-vous à la banque',
  'LOCATION:Bank Hapoalim\\, Dizengoff 50',
  'END:VEVENT',
  // weekly ulpan, local time, with one lesson moved and one cancelled
  'BEGIN:VEVENT',
  'UID:ulpan@example',
  'DTSTART;TZID=Asia/Jerusalem:20310106T180000',
  'DTEND;TZID=Asia/Jerusalem:20310106T200000',
  'RRULE:FREQ=WEEKLY;COUNT=4',
  'EXDATE;TZID=Asia/Jerusalem:20310120T180000',
  'SUMMARY:Oulpan',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:ulpan@example',
  'RECURRENCE-ID;TZID=Asia/Jerusalem:20310113T180000',
  'DTSTART;TZID=Asia/Jerusalem:20310114T190000',
  'DTEND;TZID=Asia/Jerusalem:20310114T210000',
  'SUMMARY:Oulpan (déplacé)',
  'END:VEVENT',
  // all day
  'BEGIN:VEVENT',
  'UID:holiday@example',
  'DTSTART;VALUE=DATE:20310110',
  'DTEND;VALUE=DATE:20310111',
  'SUMMARY:Jour férié',
  'END:VEVENT',
  // cancelled: must not show
  'BEGIN:VEVENT',
  'UID:cancelled@example',
  'DTSTART:20310115T100000Z',
  'DTEND:20310115T110000Z',
  'STATUS:CANCELLED',
  'SUMMARY:Annulé',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('reading an agenda: single, repeating, moved, cancelled and all-day events', () => {
  const items = parseIcs(CALENDAR, 'Perso', day(2031, 1, 1), day(2031, 2, 1));
  const titles = items.map((i) => i.title);
  assert.ok(!titles.includes('Annulé'));
  assert.deepEqual(
    items.filter((i) => i.title.startsWith('Oulpan')).map((i) => [i.title, new Date(i.start).toISOString()]),
    [
      ['Oulpan', '2031-01-06T16:00:00.000Z'], // 18:00 in Jerusalem (UTC+2 in winter)
      ['Oulpan (déplacé)', '2031-01-14T17:00:00.000Z'], // the lesson of the 13th, moved to the 14th at 19:00
      ['Oulpan', '2031-01-27T16:00:00.000Z'], // the 20th was cancelled
    ],
  );
  const bank = items.find((i) => i.title === 'Rendez-vous à la banque')!;
  assert.deepEqual([bank.start, bank.end, bank.location, bank.calendar, bank.allDay], [day(2031, 1, 12, 9), day(2031, 1, 12, 9, 30), 'Bank Hapoalim, Dizengoff 50', 'Perso', false]);
  assert.equal(items.find((i) => i.title === 'Jour férié')!.allDay, true);
  assert.deepEqual([...items].sort((a, b) => a.start - b.start), items, 'sorted by start');
  // Outside the requested period: nothing.
  assert.deepEqual(parseIcs(CALENDAR, 'Perso', day(2032, 1, 1), day(2032, 2, 1)), []);
  assert.throws(() => parseIcs('<html>not a calendar</html>', 'x', 0, 1));
});

test('an endless repeating event stops at the end of the period', () => {
  const daily = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:d', 'DTSTART:20200101T070000Z', 'DTEND:20200101T073000Z', 'RRULE:FREQ=DAILY', 'SUMMARY:Sport', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const week = parseIcs(daily, 'Sport', day(2031, 3, 1), day(2031, 3, 7, 23, 59));
  assert.equal(week.length, 7);
});

const event = { id: 12, title: 'Soirée; jeux & pizzas', description: 'Ligne 1\nLigne 2', location: 'Rothschild 12, Tel Aviv', startsAt: day(2031, 5, 20, 17, 30), endsAt: null, url: 'https://olimtalk.example/join/abc' };

test('adding an event to Google Calendar, Outlook or any agenda', () => {
  const ics = buildIcs(event);
  assert.ok(ics.includes('DTSTART:20310520T173000Z') && ics.includes('DTEND:20310520T193000Z'));
  assert.ok(ics.includes(String.raw`SUMMARY:Soirée\; jeux & pizzas`));
  // What we write, we can read back.
  const [back] = parseIcs(ics, 'OlimTalk', day(2031, 5, 1), day(2031, 6, 1));
  assert.deepEqual([back!.title, back!.start, back!.location], ['Soirée; jeux & pizzas', event.startsAt, 'Rothschild 12, Tel Aviv']);

  const google = new URL(googleCalendarUrl(event));
  assert.equal(google.origin + google.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(google.searchParams.get('text'), 'Soirée; jeux & pizzas');
  assert.equal(google.searchParams.get('dates'), '20310520T173000Z/20310520T193000Z');
  assert.ok(google.searchParams.get('details')!.includes('https://olimtalk.example/join/abc'));

  const outlook = new URL(outlookCalendarUrl(event, 'live'));
  assert.equal(outlook.hostname, 'outlook.live.com');
  assert.equal(outlook.searchParams.get('startdt'), '2031-05-20T17:30:00.000Z');
  assert.equal(new URL(outlookCalendarUrl(event, 'office')).hostname, 'outlook.office.com');
});
