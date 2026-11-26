import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Chat, EventData } from '../../../shared/types.ts';
import { CalendarSettingsDialog, loadAgenda, type Agenda } from '../components/Calendar.tsx';
import { EventCard } from '../components/Message.tsx';
import { EventDialog } from '../components/dialogs.tsx';
import { Icon } from '../components/icons.tsx';
import { Chip, Empty, Modal, Spinner } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { formatDay, formatTime } from '../lib/format.tsx';
import { useT } from '../lib/i18n.ts';
import { useStore } from '../lib/store.ts';
import { WorldSwitcher } from './Chats.tsx';

const DAY = 86_400_000;

/** The person's own agenda (Google, Outlook, Apple…) next to the OlimTalk events they attend. */
function AgendaView({ events, onSettings }: { events: EventData[] | null; onSettings: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const lang = useStore((s) => s.lang);
  const calendars = useStore((s) => s.calendars);
  const e2e = useStore((s) => s.e2e);
  const [agenda, setAgenda] = useState<Agenda | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAgenda(null);
    const from = new Date().setHours(0, 0, 0, 0);
    loadAgenda(calendars, from, from + 30 * DAY)
      .catch((): Agenda => ({ items: [], failed: calendars.map((c) => c.name) }))
      .then((a) => !cancelled && setAgenda(a));
    return () => {
      cancelled = true;
    };
  }, [calendars]);

  const days = useMemo(() => {
    const rows = [
      ...(events ?? [])
        .filter((e) => e.myStatus === 'going' || e.myStatus === 'maybe')
        .map((e) => ({ key: `o${e.id}`, title: e.title, start: e.startsAt, allDay: false, location: e.location, calendar: 'OlimTalk', chatId: e.chatId as number | null })),
      ...(agenda?.items ?? []).map((i, n) => ({ key: `x${n}`, title: i.title, start: i.start, allDay: i.allDay, location: i.location, calendar: i.calendar, chatId: null as number | null })),
    ].sort((a, b) => a.start - b.start);
    const byDay = new Map<string, typeof rows>();
    for (const row of rows) {
      const day = new Date(row.start).toDateString();
      byDay.set(day, [...(byDay.get(day) ?? []), row]);
    }
    return [...byDay.values()];
  }, [events, agenda]);

  if (!events || !agenda) {
    return (
      <div className="center pad">
        <Spinner />
      </div>
    );
  }
  return (
    <>
      {agenda.failed.length > 0 && <div className="banner warn">{t('cal_failed', { names: agenda.failed.join(', ') })}</div>}
      {calendars.length === 0 && (
        <button type="button" className="notice as-button" onClick={onSettings}>
          <Icon name="calendar" size={18} />
          <span>{e2e === 'ready' ? t('cal_connect_text') : t('e2e_locked_banner')}</span>
          <Icon name="right" size={18} />
        </button>
      )}
      {days.length === 0 && <Empty emoji="🗓️" title={t('cal_empty')} text={t('cal_empty_text')} />}
      {days.map((rows) => (
        <section key={rows[0]!.key} className="agenda-day">
          <div className="section-title">{formatDay(rows[0]!.start, lang, t)}</div>
          <div className="card agenda-list">
            {rows.map((row) => {
              const body = (
                <>
                  <span className="agenda-time">{row.allDay ? t('cal_all_day') : formatTime(row.start, lang)}</span>
                  <span className="agenda-main">
                    <strong dir="auto">{row.title || '—'}</strong>
                    <small dir="auto">{[row.location, row.calendar].filter(Boolean).join(' · ')}</small>
                  </span>
                </>
              );
              return row.chatId != null ? (
                <button key={row.key} type="button" className="agenda-item olim" onClick={() => navigate(`/chats/${row.chatId}`)}>
                  {body}
                  <Icon name="right" size={16} />
                </button>
              ) : (
                <div key={row.key} className="agenda-item">
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

export function EventsPage() {
  const t = useT();
  const navigate = useNavigate();
  const me = useStore((s) => s.me)!;
  const chats = useStore((s) => s.chats);
  const error = useStore((s) => s.error);
  const [view, setView] = useState<'upcoming' | 'mine' | 'agenda'>('upcoming');
  const mine = view !== 'upcoming';
  const [calendarSettings, setCalendarSettings] = useState(false);
  const [events, setEvents] = useState<EventData[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [createIn, setCreateIn] = useState<number | null>(null);

  const load = () =>
    api
      .get<{ events: EventData[] }>(`/events?world=${me.world}${mine ? '&mine=1' : ''}`)
      .then((r) => setEvents(r.events))
      .catch(error);

  useEffect(() => {
    setEvents(null);
    void load();
  }, [me.world, mine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Groups where I can publish an event; event groups first.
  const myGroups = Object.values(chats)
    .filter((c): c is Chat => c.isMember && c.type === 'group' && (c.sendPolicy === 'all' || c.role === 'owner' || c.role === 'admin'))
    .sort(
      (a, b) =>
        Number(b.world === me.world) - Number(a.world === me.world) ||
        Number(b.category === 'event') - Number(a.category === 'event') ||
        b.lastActivity - a.lastActivity,
    );

  return (
    <div className="page">
      <header className="pane-head">
        <h1>{t('tab_events')}</h1>
        <WorldSwitcher />
        <span className="grow" />
        <button type="button" className="btn small primary" onClick={() => setPicking(true)}>
          <Icon name="plus" size={16} /> {t('new_event')}
        </button>
      </header>
      <div className="page-scroll">
        <div className="page-inner">
          <div className="hero-banner events">
            <div>
              <h2>{t('events_title')}</h2>
              <p>{t('events_subtitle')}</p>
            </div>
            <span className="hero-emoji">🎉</span>
          </div>
          <div className="chips">
            <Chip active={view === 'upcoming'} onClick={() => setView('upcoming')}>
              {t('events_upcoming')}
            </Chip>
            <Chip active={view === 'mine'} onClick={() => setView('mine')}>
              {t('events_mine')}
            </Chip>
            <Chip active={view === 'agenda'} onClick={() => setView('agenda')}>
              🗓️ {t('cal_mine')}
            </Chip>
            {view === 'agenda' && (
              <button type="button" className="chip" onClick={() => setCalendarSettings(true)}>
                <Icon name="link" size={14} /> {t('cal_manage')}
              </button>
            )}
          </div>
          {view === 'agenda' && <AgendaView events={events} onSettings={() => setCalendarSettings(true)} />}
          {view !== 'agenda' && !events && (
            <div className="center pad">
              <Spinner />
            </div>
          )}
          {view !== 'agenda' && events && events.length === 0 && (
            <Empty emoji="📅" title={t('no_events')} text={t('no_events_text')}>
              <button type="button" className="btn primary" onClick={() => setPicking(true)}>
                <Icon name="plus" size={18} /> {t('new_event')}
              </button>
            </Empty>
          )}
          <div className="event-grid">
            {(view === 'agenda' ? [] : (events ?? [])).map((ev) => (
              <div key={ev.id} className="card event-wrap">
                <EventCard ev={ev} onChange={(next) => setEvents((prev) => prev?.map((e) => (e.id === next.id ? next : e)) ?? null)} />
                <button type="button" className="event-group" onClick={() => navigate(`/chats/${ev.chatId}`)}>
                  <span>{ev.chatEmoji}</span> {ev.chatName} <Icon name="right" size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {picking && (
        <Modal title={t('event_pick_group')} onClose={() => setPicking(false)}>
          <p className="muted small">{t('event_pick_group_text')}</p>
          <div className="pick-list">
            {myGroups.map((c) => (
              <button
                key={c.id}
                type="button"
                className="pick"
                onClick={() => {
                  setPicking(false);
                  setCreateIn(c.id);
                }}
              >
                <span className="pick-emoji">{c.emoji}</span>
                <span className="pick-name">{c.name}</span>
                <Icon name="right" size={16} />
              </button>
            ))}
            {myGroups.length === 0 && <p className="muted center pad">{t('no_chats_text')}</p>}
          </div>
        </Modal>
      )}
      {calendarSettings && <CalendarSettingsDialog onClose={() => setCalendarSettings(false)} />}
      {createIn != null && (
        <EventDialog
          chatId={createIn}
          onClose={() => {
            setCreateIn(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
