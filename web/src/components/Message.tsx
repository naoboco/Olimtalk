import { memo, useEffect, useRef, useState } from 'react';
import type { Attachment, Chat, EventData, Lang, Message, MessagePreview, PollData, SystemInfo } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';
import { colorFor, formatBytes, formatDateTime, formatDuration, formatMonth, formatTime, isEmojiOnly, plainText, richText } from '../lib/format.tsx';
import { useT, type T } from '../lib/i18n.ts';
import { inviteUrl } from '../lib/share.ts';
import { useStore, type ClientMessage } from '../lib/store.ts';
import { Icon } from './icons.tsx';
import { Avatar } from './ui.tsx';

export function systemText(info: SystemInfo | undefined, t: T): string {
  if (!info) return '';
  if (info.kind === 'created') return t('sys_created', { actor: info.actor ?? '', value: info.value ?? '' });
  if (info.kind === 'pinned') return t('sys_pinned', { actor: info.actor ?? '' });
  if (info.kind === 'renamed') return t('sys_renamed', { actor: info.actor ?? '', value: info.value ?? '' });
  return info.value ?? '';
}

/** One-line description of a message for lists, replies and notifications. */
export function previewLine(m: Pick<MessagePreview, 'type' | 'text' | 'deleted' | 'system'>, t: T): string {
  if (m.deleted) return `🚫 ${t('message_deleted')}`;
  const text = plainText(m.text);
  switch (m.type) {
    case 'system':
      return systemText(m.system, t);
    case 'image':
      return `📷 ${text || t('photo')}`;
    case 'video':
      return `🎬 ${text || t('video')}`;
    case 'audio':
      return `🎤 ${t('voice_message')}`;
    case 'file':
      return `📎 ${text || t('document')}`;
    case 'poll':
      return `📊 ${text}`;
    case 'event':
      return `📅 ${text}`;
    default:
      return text;
  }
}

// ───────────── attachments ─────────────

export function AudioPlayer({ src, duration }: { src: string; duration?: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => undefined);
    else a.pause();
  };
  const pct = total > 0 ? Math.min(100, (pos / total) * 100) : 0;
  return (
    <div className="audio">
      <button type="button" className="audio-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        <Icon name={playing ? 'pause' : 'play'} size={18} fill />
      </button>
      <div
        className="audio-track"
        onClick={(e) => {
          const a = ref.current;
          if (!a || !total) return;
          const r = e.currentTarget.getBoundingClientRect();
          a.currentTime = ((e.clientX - r.left) / r.width) * total;
        }}
      >
        <div className="audio-bar">
          <div className="audio-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="audio-time">{formatDuration(playing || pos > 0 ? pos : total)}</span>
      </div>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPos(0);
        }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotal(d);
        }}
      />
    </div>
  );
}

function AttachmentView({ a }: { a: Attachment }) {
  const openLightbox = useStore((s) => s.openLightbox);
  if (a.kind === 'image' || a.kind === 'video') {
    const ratio = a.width && a.height ? a.width / a.height : 4 / 3;
    const width = Math.min(320, Math.max(160, Math.round(260 * Math.min(ratio, 1.4))));
    return (
      <button type="button" className="media" style={{ width, aspectRatio: String(Math.max(0.6, Math.min(ratio, 2))) }} onClick={() => openLightbox(a)}>
        {a.kind === 'image' ? <img src={a.url} alt={a.name} loading="lazy" /> : <video src={a.url} preload="metadata" muted playsInline />}
        {a.kind === 'video' && (
          <span className="media-play">
            <Icon name="play" size={26} fill />
          </span>
        )}
      </button>
    );
  }
  if (a.kind === 'audio') return <AudioPlayer src={a.url} duration={a.duration} />;
  return (
    <a className="file" href={a.url} download={a.name} target="_blank" rel="noopener noreferrer">
      <span className="file-icon">
        <Icon name="file" size={22} />
      </span>
      <span className="file-meta">
        <span className="file-name">{a.name}</span>
        <span className="file-size">{formatBytes(a.size)}</span>
      </span>
      <Icon name="download" size={18} />
    </a>
  );
}

// ───────────── polls ─────────────

function PollCard({ m, canVote }: { m: Message; canVote: boolean }) {
  const t = useT();
  const error = useStore((s) => s.error);
  const patchMessage = useStore((s) => s.patchMessage);
  const poll = m.poll as PollData;
  const totalVotes = poll.counts.reduce((a, b) => a + b, 0);
  const vote = async (i: number) => {
    if (!canVote || m.id < 0) return;
    const has = poll.myVotes.includes(i);
    const next = poll.multiple ? (has ? poll.myVotes.filter((x) => x !== i) : [...poll.myVotes, i]) : has ? [] : [i];
    // optimistic
    const counts = poll.counts.map((c, idx) => c - (poll.myVotes.includes(idx) ? 1 : 0) + (next.includes(idx) ? 1 : 0));
    patchMessage(m.chatId, m.id, (x) => (x.poll ? { ...x, poll: { ...x.poll, myVotes: next, counts } } : x));
    try {
      await api.post(`/messages/${m.id}/vote`, { options: next });
    } catch (e) {
      patchMessage(m.chatId, m.id, (x) => ({ ...x, poll }));
      error(e);
    }
  };
  return (
    <div className="poll">
      <div className="poll-q" dir="auto">
        📊 {poll.question}
      </div>
      <div className="poll-hint">{poll.multiple ? t('poll_multiple') : t('poll_single')}</div>
      {poll.options.map((opt, i) => {
        const mine = poll.myVotes.includes(i);
        const pct = totalVotes ? Math.round((poll.counts[i]! / totalVotes) * 100) : 0;
        return (
          <button key={i} type="button" className={`poll-opt ${mine ? 'mine' : ''}`} onClick={() => vote(i)} disabled={!canVote}>
            <span className="poll-fill" style={{ width: `${pct}%` }} />
            <span className={`poll-check ${poll.multiple ? 'multi' : ''}`}>{mine && <Icon name="check" size={13} />}</span>
            <span className="poll-label" dir="auto">
              {opt}
            </span>
            <span className="poll-count">{poll.counts[i]}</span>
          </button>
        );
      })}
      <div className="poll-foot">{t('poll_voters', { n: poll.voters })}</div>
    </div>
  );
}

// ───────────── events ─────────────

export function EventCard({ ev, onChange, compact }: { ev: EventData; onChange?: (ev: EventData) => void; compact?: boolean }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const error = useStore((s) => s.error);
  const openShare = useStore((s) => s.openShare);
  const [busy, setBusy] = useState(false);
  const date = formatMonth(ev.startsAt, lang);
  const rsvp = async (status: EventData['myStatus']) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = ev.myStatus === status ? null : status;
      const r = await api.post<{ event: EventData }>(`/events/${ev.id}/rsvp`, { status: next });
      onChange?.(r.event);
      if (next === 'going') void useStore.getState().loadChats();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  const when = formatDateTime(ev.startsAt, lang);
  return (
    <div className={`event ${compact ? 'compact' : ''}`}>
      <div className="event-top">
        <div className="event-date">
          <span className="event-month">{date.month}</span>
          <span className="event-day">{date.day}</span>
          <span className="event-weekday">{date.weekday}</span>
        </div>
        <div className="event-main">
          <div className="event-title" dir="auto">
            {ev.title}
          </div>
          <div className="event-line">
            <Icon name="clock" size={15} /> {when}
          </div>
          {ev.location && (
            <a
              className="event-line link"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="mapPin" size={15} /> <span dir="auto">{ev.location}</span>
            </a>
          )}
          {ev.description && (
            <p className="event-desc" dir="auto">
              {richText(ev.description)}
            </p>
          )}
        </div>
      </div>
      <div className="event-stats">
        <span>✅ {t('event_going_n', { n: ev.going })}</span>
        {ev.maybe > 0 && <span>🤔 {t('event_maybe_n', { n: ev.maybe })}</span>}
      </div>
      <div className="event-actions">
        <button type="button" className={`btn small ${ev.myStatus === 'going' ? 'primary' : 'soft'}`} onClick={() => rsvp('going')} disabled={busy}>
          {t('event_going')}
        </button>
        <button type="button" className={`btn small ${ev.myStatus === 'maybe' ? 'primary' : 'soft'}`} onClick={() => rsvp('maybe')} disabled={busy}>
          {t('event_maybe')}
        </button>
        <button type="button" className={`btn small ${ev.myStatus === 'no' ? 'primary' : 'soft'}`} onClick={() => rsvp('no')} disabled={busy}>
          {t('event_no')}
        </button>
        <button
          type="button"
          className="btn small ghost icon-only"
          aria-label={t('share')}
          title={t('share')}
          onClick={() =>
            ev.inviteCode &&
            openShare({
              title: ev.title,
              text: t('share_event_text', { title: ev.title, when, where: ev.location || ev.chatName }),
              url: inviteUrl(ev.inviteCode),
              emoji: '📅',
              subtitle: `${when}${ev.location ? ` · ${ev.location}` : ''}`,
              cta: t('share_cta_event'),
            })
          }
        >
          <Icon name="share" size={17} />
        </button>
      </div>
    </div>
  );
}

// ───────────── message row ─────────────

export interface MessageRowProps {
  m: ClientMessage;
  chat: Chat;
  mine: boolean;
  showAuthor: boolean; // first of a run of messages by the same person
  showAvatar: boolean; // last of the run
  highlighted: boolean;
  lang: Lang;
  onMenu: (m: ClientMessage, x: number, y: number) => void;
  onReact: (m: ClientMessage, emoji: string) => void;
  onJump: (id: number) => void;
  onRetry: (m: ClientMessage) => void;
}

export const MessageRow = memo(function MessageRow({ m, chat, mine, showAuthor, showAvatar, highlighted, lang, onMenu, onReact, onJump, onRetry }: MessageRowProps) {
  const t = useT();
  const openProfile = useStore((s) => s.openProfile);
  const patchMessage = useStore((s) => s.patchMessage);
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(press.current), []);

  if (m.type === 'system') {
    return (
      <div className="sys" data-mid={m.id}>
        <span>{systemText(m.system, t)}</span>
      </div>
    );
  }

  const group = chat.type === 'group';
  const read = chat.type === 'dm' && (chat.peerLastReadId ?? 0) >= m.id;
  const bigEmoji = m.type === 'text' && !m.replyTo && isEmojiOnly(m.text);
  const canAct = m.id > 0 && !m.deleted;

  const openMenu = (x: number, y: number) => canAct && onMenu(m, x, y);

  return (
    <div
      className={`row ${mine ? 'mine' : 'theirs'} ${showAvatar ? 'tail' : ''} ${highlighted ? 'flash' : ''}`}
      data-mid={m.id}
      onContextMenu={(e) => {
        if (!canAct) return;
        e.preventDefault();
        openMenu(e.clientX, e.clientY);
      }}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        if (!touch) return;
        const { clientX, clientY } = touch;
        press.current = setTimeout(() => openMenu(clientX, clientY), 480);
      }}
      onTouchMove={() => clearTimeout(press.current)}
      onTouchEnd={() => clearTimeout(press.current)}
    >
      {group && !mine && (
        <div className="row-avatar">
          {showAvatar && <Avatar id={m.userId} name={m.user.name} src={m.user.avatar} size={30} onClick={m.user.isSystem ? undefined : () => openProfile(m.userId)} />}
        </div>
      )}
      <div className="bubble-wrap">
        <div className={`bubble ${m.deleted ? 'deleted' : ''} ${bigEmoji ? 'big-emoji' : ''} ${m.type === 'image' || m.type === 'video' ? 'has-media' : ''}`}>
          {group && !mine && showAuthor && !m.deleted && (
            <button type="button" className="author" style={{ color: colorFor(m.userId) }} onClick={() => !m.user.isSystem && openProfile(m.userId)}>
              {m.user.name}
              {m.user.isSystem && <Icon name="shield" size={13} />}
            </button>
          )}
          {m.forwarded && !m.deleted && (
            <div className="fwd">
              <Icon name="forward" size={13} /> {t('forwarded')}
            </div>
          )}
          {m.replyTo && (
            <button type="button" className="quote" style={{ borderColor: colorFor(m.replyTo.userId) }} onClick={() => onJump(m.replyTo!.id)}>
              <span className="quote-author" style={{ color: colorFor(m.replyTo.userId) }}>
                {m.replyTo.userName}
              </span>
              <span className="quote-text" dir="auto">
                {previewLine({ ...m.replyTo, system: undefined }, t)}
              </span>
            </button>
          )}
          {m.deleted ? (
            <span className="deleted-text">🚫 {t('message_deleted')}</span>
          ) : (
            <>
              {m.attachment && <AttachmentView a={m.attachment} />}
              {m.poll && <PollCard m={m} canVote={chat.isMember} />}
              {m.event && (
                <EventCard ev={m.event} compact onChange={(ev) => patchMessage(m.chatId, m.id, (x) => ({ ...x, event: ev }))} />
              )}
              {m.text && m.type !== 'event' && (
                <div className="text" dir="auto">
                  {richText(m.text)}
                </div>
              )}
            </>
          )}
          <span className="meta">
            {m.pinnedAt && <Icon name="pin" size={12} />}
            {m.starred && <Icon name="star" size={12} fill />}
            {m.editedAt && !m.deleted && <span>{t('edited')}</span>}
            <time>{formatTime(m.createdAt, lang)}</time>
            {mine && !m.deleted && (
              <span className={`ticks ${read ? 'read' : ''}`}>
                {m.failed ? '!' : m.pending ? <Icon name="clock" size={13} /> : <Icon name={chat.type === 'dm' ? 'checks' : 'check'} size={15} />}
              </span>
            )}
          </span>
          {canAct && (
            <button
              type="button"
              className="bubble-more"
              aria-label={t('more')}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                openMenu(mine ? r.right - 230 : r.left, r.bottom + 4);
              }}
            >
              <Icon name="down" size={16} />
            </button>
          )}
        </div>
        {m.reactions.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button key={r.emoji} type="button" className={`reaction ${r.mine ? 'mine' : ''}`} onClick={() => chat.isMember && onReact(m, r.emoji)}>
                <span>{r.emoji}</span>
                {r.count > 1 && <span className="reaction-n">{r.count}</span>}
              </button>
            ))}
          </div>
        )}
        {m.failed && (
          <button type="button" className="retry" onClick={() => onRetry(m)}>
            <Icon name="refresh" size={14} /> {t('retry')}
          </button>
        )}
      </div>
    </div>
  );
});
