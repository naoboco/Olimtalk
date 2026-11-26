import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORY_EMOJI, CITIES, PROFILE_EMOJI, cityName } from '../../../shared/data.ts';
import { CATEGORIES, type Chat, type ChatCategory, type Community, type Message, type UserPublic } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';
import { lastSeen } from '../lib/format.tsx';
import { useT, type Key } from '../lib/i18n.ts';
import { uploadFile } from '../lib/media.ts';
import { useStore } from '../lib/store.ts';
import { Icon } from './icons.tsx';
import { saveAttachment, useAttachmentUrl } from './Message.tsx';
import { Avatar, ChatAvatar, Field, GROUP_EMOJIS, Modal, Spinner, useDismiss } from './ui.tsx';

export const categoryKey = (c: ChatCategory) => `cat_${c}` as Key;
export const profileKey = (p: string) => `profile_${p}` as Key;

export function Confirm({
  title,
  text,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  text?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'danger' : 'primary'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
                onClose();
              }
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {text && <p className="muted">{text}</p>}
    </Modal>
  );
}

/** Avatar chooser: an emoji from a palette or an uploaded picture. */
function IconChooser({
  emoji,
  avatar,
  onEmoji,
  onAvatar,
}: {
  emoji: string;
  avatar: string | null;
  onEmoji: (e: string) => void;
  onAvatar: (url: string | null) => void;
}) {
  const t = useT();
  const error = useStore((s) => s.error);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="icon-chooser">
      <div className="icon-chooser-top">
        <Avatar id={emoji.codePointAt(0) ?? 1} name="" emoji={emoji} src={avatar} size={64} />
        <div className="icon-chooser-actions">
          <button type="button" className="btn small soft" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Spinner size={14} /> : <Icon name="camera" size={16} />} {t('upload_photo')}
          </button>
          {avatar && (
            <button type="button" className="btn small ghost" onClick={() => onAvatar(null)}>
              {t('remove_photo')}
            </button>
          )}
        </div>
      </div>
      <div className="emoji-row">
        {GROUP_EMOJIS.map((e) => (
          <button key={e} type="button" className={e === emoji && !avatar ? 'active' : ''} onClick={() => (onEmoji(e), onAvatar(null))}>
            {e}
          </button>
        ))}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            onAvatar((await uploadFile(file)).url);
          } catch (err) {
            error(err);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

// ───────────── create / edit group ─────────────

export function GroupDialog({ chat, community, onClose }: { chat?: Chat; community?: Community; onClose: () => void }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const error = useStore((s) => s.error);
  const upsertChat = useStore((s) => s.upsertChat);
  const navigate = useNavigate();
  const [name, setName] = useState(chat?.name ?? '');
  const [description, setDescription] = useState(chat?.description ?? '');
  const [emoji, setEmoji] = useState(chat?.emoji ?? '💬');
  const [avatar, setAvatar] = useState<string | null>(chat?.avatar ?? null);
  const [category, setCategory] = useState<ChatCategory>(chat?.category ?? 'general');
  const [city, setCity] = useState(chat?.city ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const body = { name, description, emoji, avatar, category, city: category === 'city' ? city || null : null };
      if (chat) {
        const r = await api.patch<{ chat: Chat }>(`/chats/${chat.id}`, body);
        upsertChat(r.chat);
      } else {
        const r = await api.post<{ chat: Chat }>('/chats', { ...body, communityId: community?.id });
        upsertChat(r.chat);
        navigate(`/chats/${r.chat.id}`);
      }
      onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={chat ? t('edit_group') : community ? t('new_group_in', { name: community.name }) : t('new_group')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn primary" disabled={busy || name.trim().length < 3} onClick={save}>
            {chat ? t('save') : t('create')}
          </button>
        </>
      }
    >
      {!chat && (
        <div className="notice">
          <Icon name="globe" size={18} />
          <span>{t('public_group_notice')}</span>
        </div>
      )}
      <IconChooser emoji={emoji} avatar={avatar} onEmoji={setEmoji} onAvatar={setAvatar} />
      <Field label={t('group_name')}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('group_name_ph')} autoFocus dir="auto" />
      </Field>
      <Field label={t('description')}>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} placeholder={t('group_desc_ph')} dir="auto" />
      </Field>
      <Field label={t('category')}>
        <div className="chips wrap">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={`chip ${c === category ? 'active' : ''}`} onClick={() => setCategory(c)}>
              {CATEGORY_EMOJI[c]} {t(categoryKey(c))}
            </button>
          ))}
        </div>
      </Field>
      {category === 'city' && (
        <Field label={t('city')}>
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">—</option>
            {CITIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name[lang]}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Modal>
  );
}

export function CommunityDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const error = useStore((s) => s.error);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('🌍');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ community: Community }>('/communities', {
        name,
        description,
        emoji,
        avatar,
        announcementName: t('announcements_of', { name }).slice(0, 80),
      });
      await useStore.getState().loadChats();
      navigate(`/community/${r.community.id}`);
      onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t('new_community')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn primary" disabled={busy || name.trim().length < 3} onClick={save}>
            {t('create')}
          </button>
        </>
      }
    >
      <div className="notice">
        <Icon name="megaphone" size={18} />
        <span>{t('community_notice')}</span>
      </div>
      <IconChooser emoji={emoji} avatar={avatar} onEmoji={setEmoji} onAvatar={setAvatar} />
      <Field label={t('community_name')}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus dir="auto" />
      </Field>
      <Field label={t('description')}>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} dir="auto" />
      </Field>
    </Modal>
  );
}

// ───────────── poll & event ─────────────

export function PollDialog({ chatId, onClose }: { chatId: number; onClose: () => void }) {
  const t = useT();
  const send = useStore((s) => s.send);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const clean = options.map((o) => o.trim()).filter(Boolean);
  return (
    <Modal
      title={t('new_poll')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!question.trim() || clean.length < 2}
            onClick={() => {
              void send(chatId, { poll: { question: question.trim(), options: clean, multiple } });
              onClose();
            }}
          >
            {t('send')}
          </button>
        </>
      }
    >
      <Field label={t('poll_question')}>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} autoFocus dir="auto" />
      </Field>
      <div className="field">
        <span className="field-label">{t('poll_options')}</span>
        {options.map((o, i) => (
          <input
            key={i}
            value={o}
            maxLength={120}
            dir="auto"
            placeholder={t('poll_option_n', { n: i + 1 })}
            onChange={(e) => {
              const next = options.map((x, j) => (j === i ? e.target.value : x));
              // Always keep one empty line at the end, up to 12 options.
              if (i === options.length - 1 && e.target.value && options.length < 12) next.push('');
              setOptions(next);
            }}
          />
        ))}
      </div>
      <label className="switch-row">
        <span>{t('poll_allow_multiple')}</span>
        <input type="checkbox" className="switch" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />
      </label>
    </Modal>
  );
}

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function EventDialog({ chatId, onClose }: { chatId: number; onClose: () => void }) {
  const t = useT();
  const error = useStore((s) => s.error);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 86_400_000);
    d.setMinutes(0, 0, 0);
    return toLocalInput(d);
  });
  const [busy, setBusy] = useState(false);
  const startsAt = new Date(when).getTime();
  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/chats/${chatId}/events`, { title, location, description, startsAt });
      onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t('new_event')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn primary" disabled={busy || title.trim().length < 3 || !Number.isFinite(startsAt) || startsAt < Date.now()} onClick={save}>
            {t('create')}
          </button>
        </>
      }
    >
      <Field label={t('event_title')}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus dir="auto" />
      </Field>
      <Field label={t('event_when')}>
        <input type="datetime-local" value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
      </Field>
      <Field label={t('event_where')}>
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder={t('event_where_ph')} dir="auto" />
      </Field>
      <Field label={t('description')}>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} dir="auto" />
      </Field>
    </Modal>
  );
}

// ───────────── forward ─────────────

export function ForwardDialog({ message, onClose }: { message: Message; onClose: () => void }) {
  const t = useT();
  const chats = useStore((s) => s.chats);
  const error = useStore((s) => s.error);
  const toast = useStore((s) => s.toast);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const list = useMemo(
    () =>
      Object.values(chats)
        .filter((c) => c.isMember && (c.sendPolicy === 'all' || c.role === 'owner' || c.role === 'admin'))
        .filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => b.lastActivity - a.lastActivity),
    [chats, q],
  );
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 10 ? [...p, id] : p));
  return (
    <Modal
      title={t('forward_to')}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn primary block"
          disabled={!picked.length || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await useStore.getState().forwardMessage(message, picked);
              toast(t('forwarded_ok'));
              onClose();
            } catch (e) {
              error(e);
              setBusy(false);
            }
          }}
        >
          <Icon name="forward" size={18} /> {t('forward')} {picked.length > 0 && `(${picked.length})`}
        </button>
      }
    >
      <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} autoFocus />
      <div className="pick-list">
        {list.map((c) => (
          <button key={c.id} type="button" className={`pick ${picked.includes(c.id) ? 'active' : ''}`} onClick={() => toggle(c.id)}>
            <ChatAvatar chat={c} size={40} />
            <span className="pick-name">{c.name}</span>
            <span className="pick-check">{picked.includes(c.id) && <Icon name="check" size={15} />}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ───────────── report ─────────────

const REASONS = ['spam', 'harassment', 'hate', 'scam', 'illegal', 'other'] as const;

export function ReportDialog({
  targetType,
  targetId,
  evidence,
  onClose,
}: {
  targetType: 'message' | 'user' | 'chat' | 'story';
  targetId: number;
  /** Decrypted text of an encrypted message, which reporting discloses to the moderators. */
  evidence?: string;
  onClose: () => void;
}) {
  const t = useT();
  const error = useStore((s) => s.error);
  const toast = useStore((s) => s.toast);
  const [reason, setReason] = useState<(typeof REASONS)[number]>('spam');
  const [details, setDetails] = useState('');
  return (
    <Modal
      title={t('report')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              try {
                await api.post('/reports', { targetType, targetId, reason, details, evidence: evidence?.slice(0, 500) || undefined });
                toast(t('report_sent'));
                onClose();
              } catch (e) {
                error(e);
              }
            }}
          >
            {t('report')}
          </button>
        </>
      }
    >
      <p className="muted">{t('report_intro')}</p>
      {evidence !== undefined && (
        <div className="notice">
          <Icon name="shield" size={18} />
          <span>{t('report_encrypted_notice')}</span>
        </div>
      )}
      <div className="radio-list">
        {REASONS.map((r) => (
          <label key={r} className="radio">
            <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
            <span>{t(`reason_${r}` as Key)}</span>
          </label>
        ))}
      </div>
      <Field label={t('report_details')}>
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} maxLength={1000} dir="auto" />
      </Field>
    </Modal>
  );
}

// ───────────── user profile card ─────────────

export function UserProfileModal() {
  const t = useT();
  const id = useStore((s) => s.profileUserId);
  const openProfile = useStore((s) => s.openProfile);
  const me = useStore((s) => s.me);
  const lang = useStore((s) => s.lang);
  const error = useStore((s) => s.error);
  const setMe = useStore((s) => s.setMe);
  const upsertChat = useStore((s) => s.upsertChat);
  const navigate = useNavigate();
  const [data, setData] = useState<{ user: UserPublic; sharedGroups: { id: number; name: string; emoji: string }[] } | null>(null);
  const [report, setReport] = useState(false);

  useEffect(() => {
    setData(null);
    setReport(false);
    if (id == null) return;
    let cancelled = false;
    api
      .get<{ user: UserPublic; sharedGroups: { id: number; name: string; emoji: string }[] }>(`/users/${id}`)
      .then((r) => !cancelled && setData(r))
      .catch((e) => {
        error(e);
        openProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (id == null || !me) return null;
  const close = () => openProfile(null);
  if (report) return <ReportDialog targetType="user" targetId={id} onClose={() => setReport(false)} />;
  const u = data?.user;
  const blocked = me.blocked.includes(id);
  const self = me.id === id;

  const message = async () => {
    try {
      const r = await api.post<{ chat: Chat }>('/dm', { userId: id });
      upsertChat(r.chat);
      close();
      navigate(`/chats/${r.chat.id}`);
    } catch (e) {
      error(e);
    }
  };
  const toggleBlock = async () => {
    try {
      const r = blocked ? await api.del<{ me: typeof me }>(`/users/${id}/block`) : await api.post<{ me: typeof me }>(`/users/${id}/block`);
      setMe(r.me);
    } catch (e) {
      error(e);
    }
  };

  return (
    <Modal title={t('profile')} onClose={close}>
      {!u ? (
        <div className="center pad">
          <Spinner />
        </div>
      ) : (
        <div className="profile-card">
          <Avatar id={u.id} name={u.name} src={u.avatar} size={96} online={u.online} />
          <h3>{u.name}</h3>
          <div className="muted">@{u.username}</div>
          <div className="muted small">{u.online ? t('online') : lastSeen(u.lastSeen, lang, t)}</div>
          <div className="tags">
            {u.profile && (
              <span className="tag">
                {PROFILE_EMOJI[u.profile]} {t(profileKey(u.profile))}
              </span>
            )}
            {u.city && <span className="tag">📍 {cityName(u.city, lang)}</span>}
            {u.aliyahYear && <span className="tag">✈️ {t('aliyah_in', { year: u.aliyahYear })}</span>}
          </div>
          {u.bio && (
            <p className="bio" dir="auto">
              {u.bio}
            </p>
          )}
          {!self && (
            <div className="profile-actions">
              <button type="button" className="btn primary" onClick={message} disabled={blocked}>
                <Icon name="chat" size={18} /> {t('send_message')}
              </button>
              <button type="button" className="btn soft" onClick={toggleBlock}>
                <Icon name="block" size={18} /> {blocked ? t('unblock') : t('block')}
              </button>
              <button type="button" className="btn ghost" onClick={() => setReport(true)}>
                <Icon name="flag" size={18} /> {t('report')}
              </button>
            </div>
          )}
          {data.sharedGroups.length > 0 && !self && (
            <div className="shared">
              <div className="section-title">{t('groups_in_common')}</div>
              {data.sharedGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="shared-row"
                  onClick={() => {
                    close();
                    navigate(`/chats/${g.id}`);
                  }}
                >
                  <span>{g.emoji}</span> {g.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ───────────── lightbox ─────────────

export function Lightbox() {
  const a = useStore((s) => s.lightbox);
  const open = useStore((s) => s.openLightbox);
  const error = useStore((s) => s.error);
  const { url, failed } = useAttachmentUrl(a);
  useDismiss(() => open(null), !!a);
  if (!a) return null;
  return (
    <div className="lightbox" onClick={() => open(null)}>
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn" aria-label="Download" onClick={() => void saveAttachment(a).catch(error)}>
          <Icon name="download" />
        </button>
        <button type="button" className="icon-btn" onClick={() => open(null)} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      {!url ? (
        failed ? (
          <span>⚠️</span>
        ) : (
          <Spinner size={32} />
        )
      ) : a.kind === 'video' ? (
        <video src={url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
      ) : (
        <img src={url} alt={a.name} onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  );
}

// ───────────── unlocking private messages on this device ─────────────

export function UnlockDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { unlock, toast } = useStore.getState();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const submit = async () => {
    setBusy(true);
    setWrong(false);
    try {
      await unlock(password);
      toast(t('e2e_unlocked'));
      onClose();
    } catch {
      // The key does not open: wrong password (the server never learns which it was).
      setWrong(true);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t('e2e_unlock_title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn primary" disabled={busy || !password} onClick={() => void submit()}>
            {busy ? <Spinner size={16} /> : <Icon name="shield" size={18} />} {t('e2e_unlock')}
          </button>
        </>
      }
    >
      <p className="muted">{t('e2e_unlock_text')}</p>
      {wrong && <div className="banner error">{t('err_wrong_password')}</div>}
      <Field label={t('password')}>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && password && void submit()}
        />
      </Field>
    </Modal>
  );
}
