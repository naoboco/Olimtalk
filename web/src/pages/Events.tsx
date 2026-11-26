import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Chat, EventData } from '../../../shared/types.ts';
import { EventCard } from '../components/Message.tsx';
import { EventDialog } from '../components/dialogs.tsx';
import { Icon } from '../components/icons.tsx';
import { Chip, Empty, Modal, Spinner } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useT } from '../lib/i18n.ts';
import { useStore } from '../lib/store.ts';
import { WorldSwitcher } from './Chats.tsx';

export function EventsPage() {
  const t = useT();
  const navigate = useNavigate();
  const me = useStore((s) => s.me)!;
  const chats = useStore((s) => s.chats);
  const error = useStore((s) => s.error);
  const [mine, setMine] = useState(false);
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
    .filter((c): c is Chat => c.isMember && c.type === 'group' && c.world === me.world && (c.sendPolicy === 'all' || c.role === 'owner' || c.role === 'admin'))
    .sort((a, b) => Number(b.category === 'event') - Number(a.category === 'event') || b.lastActivity - a.lastActivity);

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
            <Chip active={!mine} onClick={() => setMine(false)}>
              {t('events_upcoming')}
            </Chip>
            <Chip active={mine} onClick={() => setMine(true)}>
              {t('events_mine')}
            </Chip>
          </div>
          {!events && (
            <div className="center pad">
              <Spinner />
            </div>
          )}
          {events && events.length === 0 && (
            <Empty emoji="📅" title={t('no_events')} text={t('no_events_text')}>
              <button type="button" className="btn primary" onClick={() => setPicking(true)}>
                <Icon name="plus" size={18} /> {t('new_event')}
              </button>
            </Empty>
          )}
          <div className="event-grid">
            {events?.map((ev) => (
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
