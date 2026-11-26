// Protecting the account: connected devices, encryption keys, security codes.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { myPublicKey, safetyNumber } from '../lib/e2ee.ts';
import { formatDay, formatTime } from '../lib/format.tsx';
import { useT } from '../lib/i18n.ts';
import { useStore } from '../lib/store.ts';
import { Icon } from './icons.tsx';
import { Field, Modal, Spinner } from './ui.tsx';

interface Device {
  id: string;
  userAgent: string;
  createdAt: number;
  lastUsed: number;
  current: boolean;
}

/** A readable name for a device, from what its browser or app announces. */
export function deviceName(userAgent: string): { label: string; emoji: string } {
  const ua = userAgent;
  const app = /OlimTalk|; wv\)|Capacitor/i.test(ua);
  let system = '';
  if (/iPhone/i.test(ua)) system = 'iPhone';
  else if (/iPad/i.test(ua)) system = 'iPad';
  else if (/Android/i.test(ua)) system = 'Android';
  else if (/Windows/i.test(ua)) system = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) system = 'Mac';
  else if (/Linux/i.test(ua)) system = 'Linux';
  let browser = '';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  const phone = /iPhone|Android.*Mobile/i.test(ua);
  const label = [app ? 'OlimTalk' : browser, system].filter(Boolean).join(' · ') || '—';
  return { label, emoji: phone ? '📱' : /iPad|Android/i.test(ua) ? '📱' : '💻' };
}

export function DevicesDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const { error, toast } = useStore.getState();
  const [devices, setDevices] = useState<Device[] | null>(null);
  useEffect(() => {
    api
      .get<{ sessions: Device[] }>('/me/sessions')
      .then((r) => setDevices(r.sessions))
      .catch(error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const signOut = async (id: string) => {
    try {
      setDevices((await api.del<{ sessions: Device[] }>(`/me/sessions/${id}`)).sessions);
      toast(t('device_signed_out'));
    } catch (e) {
      error(e);
    }
  };
  return (
    <Modal title={t('devices')} onClose={onClose}>
      <p className="muted small">{t('devices_text')}</p>
      {!devices && (
        <div className="center pad">
          <Spinner />
        </div>
      )}
      <div className="member-list">
        {devices?.map((d) => {
          const name = deviceName(d.userAgent);
          return (
            <div key={d.id} className="member">
              <span className="pick-emoji">{name.emoji}</span>
              <span className="member-text">
                <strong>
                  {name.label}
                  {d.current && <span className="role inline">{t('device_this')}</span>}
                </strong>
                <small>
                  {t('device_last_used', { date: formatDay(d.lastUsed, lang, t), time: formatTime(d.lastUsed, lang) })}
                </small>
              </span>
              {!d.current && (
                <button type="button" className="btn small soft" onClick={() => void signOut(d.id)}>
                  {t('device_sign_out')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/** New keys, when the old ones can no longer be opened. Old private messages are lost. */
export function ResetEncryptionDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { resetEncryption, toast, error } = useStore.getState();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={t('e2e_reset')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={busy || !password}
            onClick={async () => {
              setBusy(true);
              try {
                await resetEncryption(password);
                toast(t('e2e_reset_done'));
                onClose();
              } catch (e) {
                error(e);
                setBusy(false);
              }
            }}
          >
            {t('e2e_reset')}
          </button>
        </>
      }
    >
      <div className="banner error">{t('e2e_reset_text')}</div>
      <Field label={t('password')}>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
    </Modal>
  );
}

/** The code two people compare to check that nobody stands between them. */
export function SafetyCode({ peerKey, peerName }: { peerKey: string | null | undefined; peerName: string }) {
  const t = useT();
  const e2e = useStore((s) => s.e2e);
  const [code, setCode] = useState<string | null>(null);
  const mine = myPublicKey();
  useEffect(() => {
    setCode(null);
    if (!peerKey || !mine) return;
    let cancelled = false;
    void safetyNumber(mine, peerKey).then((c) => !cancelled && setCode(c));
    return () => {
      cancelled = true;
    };
  }, [peerKey, mine]);
  return (
    <section className="info-section">
      <div className="section-title">
        <Icon name="shield" size={14} /> {t('e2e_title')}
      </div>
      <p className="muted small">{t('e2e_text', { name: peerName })}</p>
      {e2e !== 'ready' || !peerKey ? (
        <p className="muted small">{!peerKey ? t('err_peer_no_key') : t('e2e_locked_banner')}</p>
      ) : (
        <>
          <div className="safety-code" aria-label={t('e2e_code')}>
            {code ? code.split(' ').map((group, i) => <span key={i}>{group}</span>) : <Spinner size={18} />}
          </div>
          <p className="muted small">{t('e2e_code_text', { name: peerName })}</p>
        </>
      )}
    </section>
  );
}
