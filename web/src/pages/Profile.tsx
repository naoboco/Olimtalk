import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CITIES, PROFILE_EMOJI, cityName } from '../../../shared/data.ts';
import { PROFILES, type Me, type Message, type ProfileType, type Report, type UserPublic } from '../../../shared/types.ts';
import { AiSettingsDialog, useAi } from '../components/Ai.tsx';
import { CalendarSettingsDialog } from '../components/Calendar.tsx';
import { UnlockDialog, profileKey } from '../components/dialogs.tsx';
import { Icon, type IconName } from '../components/icons.tsx';
import { previewLine } from '../components/Message.tsx';
import { DevicesDialog, ResetEncryptionDialog } from '../components/Security.tsx';
import { Avatar, Empty, Field, Modal, Spinner } from '../components/ui.tsx';
import { PROVIDERS } from '../lib/ai/index.ts';
import { ApiError, api } from '../lib/api.ts';
import { hasKeys, rewrapForNewPassword } from '../lib/e2ee.ts';
import { formatDay } from '../lib/format.tsx';
import { useT, type Key } from '../lib/i18n.ts';
import { uploadFile } from '../lib/media.ts';
import { PUBLIC_ORIGIN, openExternal } from '../lib/platform.ts';
import { useStore, type Theme } from '../lib/store.ts';
import { WorldPicker } from './Auth.tsx';

function Row({ icon, label, hint, onClick, danger }: { icon: IconName; label: string; hint?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={`info-row link ${danger ? 'danger' : ''}`} onClick={onClick}>
      <Icon name={icon} size={20} />
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <Icon name="right" size={18} />
    </button>
  );
}

function EditProfile({ onClose }: { onClose: () => void }) {
  const t = useT();
  const me = useStore((s) => s.me)!;
  const lang = useStore((s) => s.lang);
  const { setMe, error, toast } = useStore.getState();
  const [name, setName] = useState(me.name);
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio);
  const [profile, setProfile] = useState<ProfileType | null>(me.profile);
  const [city, setCity] = useState(me.city ?? '');
  const [year, setYear] = useState(me.aliyahYear ? String(me.aliyahYear) : '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.patch<{ me: Me }>('/me', { name, username, bio, profile, city: city || null, aliyahYear: year ? Number(year) : null });
      setMe(r.me);
      toast(t('saved'));
      onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t('edit_profile')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={busy || name.trim().length < 2 || !/^[a-zA-Z0-9_.]{3,30}$/.test(username)}>
            {t('save')}
          </button>
        </>
      }
    >
      <Field label={t('your_name')}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} dir="auto" />
      </Field>
      <Field label={t('username')} hint={t('username_hint')}>
        <input value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} maxLength={30} autoCapitalize="none" />
      </Field>
      <Field label={t('bio')}>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3} placeholder={t('bio_ph')} dir="auto" />
      </Field>
      <div className="field">
        <span className="field-label">{t('your_profile')}</span>
        <div className="profile-grid">
          {PROFILES.map((p) => (
            <button key={p} type="button" className={`profile-opt ${p === profile ? 'active' : ''}`} onClick={() => setProfile(p === profile ? null : p)}>
              <span>{PROFILE_EMOJI[p]}</span>
              {t(profileKey(p))}
            </button>
          ))}
        </div>
      </div>
      <div className="two-cols">
        <Field label={t('your_city')}>
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">{t('city_none')}</option>
            {CITIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name[lang]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('aliyah_year')}>
          <input type="number" inputMode="numeric" min={1948} max={new Date().getFullYear() + 5} value={year} onChange={(e) => setYear(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const me = useStore((s) => s.me)!;
  const { error, toast } = useStore.getState();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={t('change_password')}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn primary block"
          disabled={busy || next.length < 8 || !current}
          onClick={async () => {
            setBusy(true);
            try {
              // The encryption key and the connections are locked by the password: they are
              // opened with the current one and locked again with the new one, on this device.
              const change = await rewrapForNewPassword(me.id, me.email, current, next).catch((e) => {
                throw e instanceof ApiError ? e : new ApiError(403, 'wrong_password');
              });
              await api.patch('/me', change.body);
              await change.done();
              useStore.setState({ e2e: hasKeys() ? 'ready' : 'locked' });
              toast(t('password_changed'));
              onClose();
            } catch (e) {
              error(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('save')}
        </button>
      }
    >
      <Field label={t('current_password')}>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label={t('new_password')} hint={t('password_hint')}>
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <p className="muted small">{t('password_change_note')}</p>
    </Modal>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { error, toast, deleteAccount } = useStore.getState();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={t('delete_account')}
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
                await deleteAccount(password);
                toast(t('account_deleted'));
              } catch (e) {
                error(e);
                setBusy(false);
              }
            }}
          >
            {t('delete_account_confirm')}
          </button>
        </>
      }
    >
      <div className="banner error">{t('delete_account_text')}</div>
      <Field label={t('password')}>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
    </Modal>
  );
}

function StarredDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const lang = useStore((s) => s.lang);
  const e2e = useStore((s) => s.e2e);
  const [data, setData] = useState<{ messages: Message[]; chats: { id: number; name: string; emoji: string; type: string }[] } | null>(null);
  useEffect(() => {
    api
      .get<{ messages: Message[]; chats: { id: number; name: string; emoji: string; type: string }[] }>('/starred')
      // Private messages arrive encrypted: open them here before showing them.
      .then(async (r) => setData({ ...r, messages: await useStore.getState().openMessages(r.messages) }))
      .catch(() => setData({ messages: [], chats: [] }));
  }, [e2e]);
  return (
    <Modal title={t('starred_messages')} onClose={onClose}>
      {!data && (
        <div className="center pad">
          <Spinner />
        </div>
      )}
      {data && data.messages.length === 0 && <Empty emoji="⭐" title={t('no_starred')} text={t('no_starred_text')} />}
      <div className="pick-list">
        {data?.messages.map((m) => {
          const chat = data.chats.find((c) => c.id === m.chatId);
          return (
            <button
              key={m.id}
              type="button"
              className="search-result"
              onClick={() => {
                onClose();
                navigate(`/chats/${m.chatId}`);
              }}
            >
              <strong>{m.user.name}</strong>
              <span className="muted small">
                {chat?.type === 'group' ? `${chat.emoji} ${chat.name} · ` : ''}
                {formatDay(m.createdAt, lang, t)}
              </span>
              <span className="search-snippet" dir="auto">
                {previewLine({ type: m.type, text: m.poll?.question ?? (m.text || m.attachment?.name || ''), deleted: false, encrypted: !!m.enc && !m.text && !m.attachment }, t)}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function BlockedDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const me = useStore((s) => s.me)!;
  const { setMe, error } = useStore.getState();
  const [users, setUsers] = useState<UserPublic[] | null>(null);
  useEffect(() => {
    Promise.all(me.blocked.map((id) => api.get<{ user: UserPublic }>(`/users/${id}`).then((r) => r.user).catch(() => null)))
      .then((list) => setUsers(list.filter((u): u is UserPublic => !!u)))
      .catch(() => setUsers([]));
  }, [me.blocked]);
  return (
    <Modal title={t('blocked_users')} onClose={onClose}>
      {!users && (
        <div className="center pad">
          <Spinner />
        </div>
      )}
      {users && users.length === 0 && <p className="muted center pad">{t('no_blocked')}</p>}
      <div className="member-list">
        {users?.map((u) => (
          <div key={u.id} className="member">
            <Avatar id={u.id} name={u.name} src={u.avatar} size={40} />
            <span className="member-text">
              <strong>{u.name}</strong>
              <small>@{u.username}</small>
            </span>
            <button
              type="button"
              className="btn small soft"
              onClick={async () => {
                try {
                  const r = await api.del<{ me: Me }>(`/users/${u.id}/block`);
                  setMe(r.me);
                } catch (e) {
                  error(e);
                }
              }}
            >
              {t('unblock')}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ModerationDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const lang = useStore((s) => s.lang);
  const error = useStore((s) => s.error);
  const [reports, setReports] = useState<Report[] | null>(null);
  const load = () =>
    api
      .get<{ reports: Report[] }>('/admin/reports')
      .then((r) => setReports(r.reports))
      .catch(error);
  useEffect(() => void load(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (id: number, action: 'dismiss' | 'remove' | 'ban') => {
    try {
      await api.post(`/admin/reports/${id}`, { action });
      await load();
    } catch (e) {
      error(e);
    }
  };
  return (
    <Modal title={t('moderation')} onClose={onClose} wide>
      {!reports && (
        <div className="center pad">
          <Spinner />
        </div>
      )}
      {reports && reports.length === 0 && <Empty emoji="🛡️" title={t('no_reports')} />}
      <div className="reports">
        {reports?.map((r) => (
          <div key={r.id} className={`report ${r.status}`}>
            <div className="report-head">
              <span className="tag">{t(`reason_${r.reason}` as Key)}</span>
              <span className="tag">{r.targetType}</span>
              <span className="muted small">
                {r.reporter.name} · {formatDay(r.createdAt, lang, t)}
              </span>
            </div>
            <p className="report-excerpt" dir="auto">
              {r.excerpt}
            </p>
            {r.details && (
              <p className="muted small" dir="auto">
                “{r.details}”
              </p>
            )}
            {r.status === 'open' ? (
              <div className="report-actions">
                {r.chatId && (
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      onClose();
                      navigate(`/chats/${r.chatId}`);
                    }}
                  >
                    {t('open')}
                  </button>
                )}
                <button type="button" className="btn small soft" onClick={() => void act(r.id, 'dismiss')}>
                  {t('mod_dismiss')}
                </button>
                {r.targetType !== 'user' && (
                  <button type="button" className="btn small danger" onClick={() => void act(r.id, 'remove')}>
                    {t('mod_remove')}
                  </button>
                )}
                {r.targetType !== 'chat' && (
                  <button type="button" className="btn small danger" onClick={() => void act(r.id, 'ban')}>
                    {t('mod_ban')}
                  </button>
                )}
              </div>
            ) : (
              <span className="muted small">✓ {t('mod_closed')}</span>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function ProfilePage() {
  const t = useT();
  const me = useStore((s) => s.me)!;
  const lang = useStore((s) => s.lang);
  const theme = useStore((s) => s.theme);
  const e2e = useStore((s) => s.e2e);
  const calendars = useStore((s) => s.calendars);
  const mailEnabled = useStore((s) => s.config?.mail);
  const mailUnread = useStore((s) => s.mailUnread);
  const ai = useAi();
  const navigate = useNavigate();
  const { setMe, setTheme, switchWorld, logout, error, toast, openShare } = useStore.getState();
  const [dialog, setDialog] = useState<
    'edit' | 'password' | 'starred' | 'blocked' | 'moderation' | 'delete' | 'unlock' | 'reset' | 'devices' | 'ai' | 'calendar' | null
  >(null);
  const [uploading, setUploading] = useState(false);
  const [notif, setNotif] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const input = useRef<HTMLInputElement>(null);

  const setAvatar = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const a = await uploadFile(file);
      const r = await api.patch<{ me: Me }>('/me', { avatar: a.url });
      setMe(r.me);
    } catch (e) {
      error(e);
    } finally {
      setUploading(false);
    }
  };

  // Privacy switches answer at once; the server confirms (or the switch goes back).
  const setPrivacy = async (patch: { hidePresence?: boolean; noReceipts?: boolean }) => {
    const before = me;
    setMe({ ...me, ...patch });
    try {
      setMe((await api.patch<{ me: Me }>('/me', patch)).me);
    } catch (e) {
      setMe(before);
      error(e);
    }
  };

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setNotif(p);
    if (p === 'granted') toast(t('notifications_on'));
  };

  return (
    <div className="page">
      <header className="pane-head">
        <h1>{t('tab_me')}</h1>
      </header>
      <div className="page-scroll">
        <div className="page-inner narrow">
          <div className="card me-card">
            <div className="me-avatar">
              <Avatar id={me.id} name={me.name} src={me.avatar} size={92} />
              <button type="button" className="story-add big" onClick={() => input.current?.click()} aria-label={t('upload_photo')} disabled={uploading}>
                {uploading ? <Spinner size={14} /> : <Icon name="camera" size={16} />}
              </button>
              <input ref={input} type="file" accept="image/*" hidden onChange={(e) => (void setAvatar(e.target.files?.[0]), (e.target.value = ''))} />
            </div>
            <h2 dir="auto">{me.name}</h2>
            <div className="muted">
              @{me.username} · {me.email}
            </div>
            <div className="tags">
              {me.profile && (
                <span className="tag">
                  {PROFILE_EMOJI[me.profile]} {t(profileKey(me.profile))}
                </span>
              )}
              {me.city && <span className="tag">📍 {cityName(me.city, lang)}</span>}
              {me.aliyahYear && <span className="tag">✈️ {t('aliyah_in', { year: me.aliyahYear })}</span>}
              {me.isAdmin && <span className="tag ok">🛡️ {t('role_admin')}</span>}
            </div>
            {me.bio && (
              <p className="bio" dir="auto">
                {me.bio}
              </p>
            )}
            <button type="button" className="btn soft" onClick={() => setDialog('edit')}>
              <Icon name="edit" size={18} /> {t('edit_profile')}
            </button>
          </div>

          <div className="card">
            <div className="section-title">{t('my_world')}</div>
            <p className="muted small">{t('my_world_hint')}</p>
            <WorldPicker value={me.world} onChange={(w) => void switchWorld(w).catch(error)} />
          </div>

          <div className="card">
            <div className="section-title">{t('appearance')}</div>
            <div className="segmented">
              {(['system', 'light', 'dark'] as Theme[]).map((th) => (
                <button key={th} type="button" className={theme === th ? 'active' : ''} onClick={() => setTheme(th)}>
                  <Icon name={th === 'dark' ? 'moon' : th === 'light' ? 'sun' : 'phone'} size={16} /> {t(`theme_${th}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="card list-card">
            <div className="section-title pad">{t('connections')}</div>
            <Row
              icon="sparkles"
              label={t('ai_mine')}
              hint={ai ? t('ai_connected_to', { provider: ai.provider === 'custom' ? t('ai_provider_custom') : PROVIDERS[ai.provider].label }) : t('ai_mine_hint')}
              onClick={() => (ai ? navigate('/assistant') : setDialog('ai'))}
            />
            <Row icon="calendar" label={t('cal_mine')} hint={calendars.length ? t('cal_connected_n', { n: calendars.length }) : t('cal_mine_hint')} onClick={() => setDialog('calendar')} />
            {mailEnabled !== false && (
              <Row icon="at" label={t('mail_mine')} hint={mailUnread ? t('mail_unread_n', { n: mailUnread }) : t('mail_mine_hint')} onClick={() => navigate('/mail')} />
            )}
          </div>

          <div className="card list-card">
            <div className="section-title pad">{t('security')}</div>
            <Row
              icon="shield"
              label={t('e2e_title')}
              hint={e2e === 'ready' ? t('e2e_status_ready') : t('e2e_status_locked')}
              danger={e2e !== 'ready'}
              onClick={() => (e2e === 'ready' ? toast(t('e2e_status_ready_long')) : setDialog('unlock'))}
            />
            {e2e !== 'ready' && <Row icon="refresh" label={t('e2e_reset')} hint={t('e2e_reset_hint')} onClick={() => setDialog('reset')} />}
            <Row icon="phone" label={t('devices')} hint={t('devices_hint')} onClick={() => setDialog('devices')} />
            <Row icon="shield" label={t('change_password')} onClick={() => setDialog('password')} />
            <label className="switch-row pad">
              <span>
                <Icon name="eye" size={18} /> {t('privacy_presence')}
                <small>{t('privacy_presence_hint')}</small>
              </span>
              <input type="checkbox" className="switch" checked={me.hidePresence} onChange={(e) => void setPrivacy({ hidePresence: e.target.checked })} />
            </label>
            <label className="switch-row pad">
              <span>
                <Icon name="checks" size={18} /> {t('privacy_receipts')}
                <small>{t('privacy_receipts_hint')}</small>
              </span>
              <input type="checkbox" className="switch" checked={me.noReceipts} onChange={(e) => void setPrivacy({ noReceipts: e.target.checked })} />
            </label>
            <Row icon="block" label={t('blocked_users')} hint={me.blocked.length ? String(me.blocked.length) : undefined} onClick={() => setDialog('blocked')} />
          </div>

          <div className="card list-card">
            <Row icon="star" label={t('starred_messages')} onClick={() => setDialog('starred')} />
            {notif !== 'unsupported' && notif !== 'granted' && <Row icon="bell" label={t('enable_notifications')} hint={t('enable_notifications_hint')} onClick={() => void enableNotifications()} />}
            <Row
              icon="share"
              label={t('invite_friends')}
              hint={t('invite_friends_hint')}
              onClick={() => openShare({ title: 'OlimTalk', text: t('share_app_text'), url: PUBLIC_ORIGIN, emoji: '💙', cta: t('share_cta_app') })}
            />
            {me.isAdmin && <Row icon="flag" label={t('moderation')} hint={t('moderation_hint')} onClick={() => setDialog('moderation')} />}
            <Row icon="info" label={t('legal_terms')} onClick={() => void openExternal(`${PUBLIC_ORIGIN}/terms`)} />
            <Row icon="shield" label={t('legal_privacy')} onClick={() => void openExternal(`${PUBLIC_ORIGIN}/privacy`)} />
          </div>

          <div className="card list-card">
            <Row icon="logout" label={t('log_out')} danger onClick={() => void logout()} />
            <Row icon="trash" label={t('delete_account')} hint={t('delete_account_hint')} danger onClick={() => setDialog('delete')} />
          </div>
          <p className="muted small center">OlimTalk · {t('footer_tagline')}</p>
        </div>
      </div>
      {dialog === 'edit' && <EditProfile onClose={() => setDialog(null)} />}
      {dialog === 'password' && <PasswordDialog onClose={() => setDialog(null)} />}
      {dialog === 'starred' && <StarredDialog onClose={() => setDialog(null)} />}
      {dialog === 'blocked' && <BlockedDialog onClose={() => setDialog(null)} />}
      {dialog === 'moderation' && <ModerationDialog onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteAccountDialog onClose={() => setDialog(null)} />}
      {dialog === 'unlock' && <UnlockDialog onClose={() => setDialog(null)} />}
      {dialog === 'reset' && <ResetEncryptionDialog onClose={() => setDialog(null)} />}
      {dialog === 'devices' && <DevicesDialog onClose={() => setDialog(null)} />}
      {dialog === 'ai' && <AiSettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'calendar' && <CalendarSettingsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
