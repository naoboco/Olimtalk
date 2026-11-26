// The "add to my agenda" menu shown on OlimTalk events.
import type { EventData } from '../../../shared/types.ts';
import type { MenuItem } from '../components/ui.tsx';
import type { T } from './i18n.ts';
import { buildIcs, googleCalendarUrl, outlookCalendarUrl, type CalendarEvent } from './ics-links.ts';
import { IS_NATIVE, openExternal } from './platform.ts';
import { downloadFile, inviteUrl, nativeShare } from './share.ts';

const toCalendarEvent = (ev: EventData): CalendarEvent => ({
  id: ev.id,
  title: ev.title,
  description: ev.description,
  location: ev.location,
  startsAt: ev.startsAt,
  endsAt: ev.endsAt,
  url: ev.inviteCode ? inviteUrl(ev.inviteCode) : '',
});

/** The "add to my agenda" menu of an event. */
export function addToCalendarItems(ev: EventData, t: T): MenuItem[] {
  const event = toCalendarEvent(ev);
  return [
    { icon: 'calendar', label: t('cal_google'), onClick: () => void openExternal(googleCalendarUrl(event)) },
    { icon: 'calendar', label: 'Outlook.com', onClick: () => void openExternal(outlookCalendarUrl(event, 'live')) },
    { icon: 'calendar', label: 'Microsoft 365', onClick: () => void openExternal(outlookCalendarUrl(event, 'office')) },
    {
      icon: 'download',
      label: t('cal_other'),
      onClick: () => {
        const file = new File([buildIcs(event)], 'evenement.ics', { type: 'text/calendar' });
        if (IS_NATIVE) void nativeShare({ title: ev.title, text: ev.title, url: event.url }, file);
        else downloadFile(file);
      },
    },
  ];
}
