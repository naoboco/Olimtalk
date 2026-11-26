// "Mon agenda": OlimTalk events flow into the person's own calendar, and their calendar
// can be shown inside OlimTalk — whatever the provider, through the .ics standard.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import type { CalendarLink } from '../lib/e2ee.ts';
import { useT } from '../lib/i18n.ts';
import type { AgendaItem } from '../lib/ics.ts';
import { IS_NATIVE, openExternal } from '../lib/platform.ts';
import { copyText } from '../lib/share.ts';
import { useStore } from '../lib/store.ts';
import { UnlockDialog } from './dialogs.tsx';
import { Icon } from './icons.tsx';
import { Field, Modal, Spinner } from './ui.tsx';

/** Fetch one calendar by its private .ics address. */
async function fetchIcs(url: string): Promise<string> {
  const target = url.trim().replace(/^webcal:\/\//i, 'https://');
  if (IS_NATIVE) {
    // The app talks to the calendar provider directly; OlimTalk's server is not involved.
    const { CapacitorHttp } = await import('@capacitor/core');
    const res = await CapacitorHttp.get({ url: target, responseType: 'text', connectTimeout: 15_000, readTimeout: 20_000 });
    if (res.status !== 200 || typeof res.data !== 'string') throw new Error('unreachable');
    return res.data;
  }
  // Browsers forbid that, so the website asks the server to fetch it (nothing is kept there).
  return (await api.post<{ ics: string }>('/ics/fetch', { url: target })).ics;
}

export interface Agenda {
  items: AgendaItem[];
  /** Calendars that could not be read. */
  failed: string[];
}

export async function loadAgenda(calendars: CalendarLink[], from: number, to: number): Promise<Agenda> {
  if (!calendars.length) return { items: [], failed: [] };
  const { parseIcs } = await import('../lib/ics.ts'); // the .ics reader is only loaded when a calendar is connected
  const results = await Promise.all(
    calendars.map(async (c) => {
      try {
        return { items: parseIcs(await fetchIcs(c.url), c.name, from, to), failed: null };
      } catch {
        return { items: [], failed: c.name };
      }
    }),
  );
  return {
    items: results.flatMap((r) => r.items).sort((a, b) => a.start - b.start),
    failed: results.map((r) => r.failed).filter((x): x is string => !!x),
  };
}

export function CalendarSettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const calendars = useStore((s) => s.calendars);
  const e2e = useStore((s) => s.e2e);
  const { saveVault, toast, error } = useStore.getState();
  const [feed, setFeed] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [unlock, setUnlock] = useState(false);

  useEffect(() => {
    api
      .get<{ url: string }>('/me/calendar-feed')
      .then((r) => setFeed(r.url))
      .catch(error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    const link = url.trim();
    if (!/^(https|webcal):\/\//i.test(link)) return toast(t('cal_bad_url'), 'error');
    setBusy(true);
    try {
      // Read it once before saving, so a wrong address is noticed now.
      const { parseIcs } = await import('../lib/ics.ts');
      parseIcs(await fetchIcs(link), name, 0, 0);
      await saveVault({ calendars: [...calendars, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, name: name.trim() || t('cal_default_name'), url: link }] });
      setName('');
      setUrl('');
      toast(t('cal_added'));
    } catch {
      toast(t('cal_unreadable'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (unlock) return <UnlockDialog onClose={() => setUnlock(false)} />;

  return (
    <Modal title={t('cal_mine')} onClose={onClose}>
      <div className="section-title">{t('cal_out_title')}</div>
      <p className="muted small">{t('cal_out_text')}</p>
      <div className="invite">
        <Icon name="calendar" size={18} />
        <span className="invite-url">{feed ? feed.replace(/^https?:\/\//, '') : '…'}</span>
      </div>
      <div className="info-actions">
        <button type="button" className="btn small primary" disabled={!feed} onClick={() => feed && void openExternal(feed.replace(/^https?:\/\//, 'webcal://'))}>
          <Icon name="plus" size={16} /> {t('cal_subscribe')}
        </button>
        <button type="button" className="btn small soft" disabled={!feed} onClick={() => feed && void copyText(feed).then((ok) => ok && toast(t('link_copied')))}>
          <Icon name="copy" size={16} /> {t('copy_link')}
        </button>
        <button
          type="button"
          className="btn small ghost"
          onClick={() =>
            void api
              .post<{ url: string }>('/me/calendar-feed/reset')
              .then((r) => (setFeed(r.url), toast(t('link_reset_done'))))
              .catch(error)
          }
        >
          <Icon name="refresh" size={16} /> {t('reset_link')}
        </button>
      </div>
      <details className="howto">
        <summary>{t('cal_howto')}</summary>
        <ul>
          <li>{t('cal_howto_google')}</li>
          <li>{t('cal_howto_outlook')}</li>
          <li>{t('cal_howto_apple')}</li>
        </ul>
      </details>

      <div className="section-title spaced">{t('cal_in_title')}</div>
      <p className="muted small">{t('cal_in_text')}</p>
      {e2e !== 'ready' ? (
        <button type="button" className="banner error as-button" onClick={() => setUnlock(true)}>
          {t('e2e_locked_banner')}
        </button>
      ) : (
        <>
          {calendars.map((c) => (
            <div key={c.id} className="member">
              <span className="pick-emoji">📅</span>
              <span className="member-text">
                <strong>{c.name}</strong>
                <small>{new URL(c.url.replace(/^webcal:/i, 'https:')).hostname}</small>
              </span>
              <button type="button" className="btn small ghost" onClick={() => void saveVault({ calendars: calendars.filter((x) => x.id !== c.id) }).catch(error)}>
                {t('delete')}
              </button>
            </div>
          ))}
          <Field label={t('cal_name')}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={t('cal_default_name')} />
          </Field>
          <Field label={t('cal_url')} hint={t('cal_url_hint')}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/basic.ics" autoCapitalize="none" spellCheck={false} />
          </Field>
          <button type="button" className="btn soft block" onClick={() => void add()} disabled={busy || !url.trim()}>
            {busy ? <Spinner size={16} /> : <Icon name="plus" size={18} />} {t('cal_add')}
          </button>
          <details className="howto">
            <summary>{t('cal_where')}</summary>
            <ul>
              <li>{t('cal_where_google')}</li>
              <li>{t('cal_where_outlook')}</li>
              <li>{t('cal_where_apple')}</li>
            </ul>
          </details>
        </>
      )}
    </Modal>
  );
}
