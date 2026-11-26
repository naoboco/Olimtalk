import type { ReactNode } from 'react';
import type { Lang } from '../../../shared/types.ts';
import type { T } from './i18n.ts';

const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', ru: 'ru-RU' };

const dayStart = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function formatTime(ts: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { hour: '2-digit', minute: '2-digit' }).format(ts);
}

/** "Today", "Yesterday", or a full date — used for the separators inside a conversation. */
export function formatDay(ts: number, lang: Lang, t: T): string {
  const diff = Math.round((dayStart(Date.now()) - dayStart(ts)) / 86_400_000);
  if (diff === 0) return t('today');
  if (diff === 1) return t('yesterday');
  const sameYear = new Date(ts).getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(LOCALE[lang], {
    weekday: diff < 7 ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
    year: sameYear ? undefined : 'numeric',
  }).format(ts);
}

/** Compact timestamp for the conversation list. */
export function formatListTime(ts: number, lang: Lang, t: T): string {
  const diff = Math.round((dayStart(Date.now()) - dayStart(ts)) / 86_400_000);
  if (diff === 0) return formatTime(ts, lang);
  if (diff === 1) return t('yesterday');
  if (diff < 7) return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short' }).format(ts);
  return new Intl.DateTimeFormat(LOCALE[lang], { day: '2-digit', month: '2-digit', year: '2-digit' }).format(ts);
}

export function formatDateTime(ts: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ts);
}

export function formatMonth(ts: number, lang: Lang): { day: string; month: string; weekday: string } {
  return {
    day: new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric' }).format(ts),
    month: new Intl.DateTimeFormat(LOCALE[lang], { month: 'short' }).format(ts).replace('.', ''),
    weekday: new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short' }).format(ts).replace('.', ''),
  };
}

export function lastSeen(ts: number, lang: Lang, t: T): string {
  const diff = Math.round((dayStart(Date.now()) - dayStart(ts)) / 86_400_000);
  if (diff === 0) return t('last_seen_today', { time: formatTime(ts, lang) });
  if (diff === 1) return t('last_seen_yesterday', { time: formatTime(ts, lang) });
  return t('last_seen_on', { date: new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'long' }).format(ts) });
}

export function timeAgo(ts: number, lang: Lang): string {
  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: 'auto', style: 'short' });
  const mins = Math.round((ts - Date.now()) / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  return rtf.format(Math.round(mins / 60), 'hour');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function compactNumber(n: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang], { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

const COLORS = ['#2F6BFF', '#12A594', '#E5484D', '#F08C00', '#8E4EC6', '#0091FF', '#D6409F', '#30A46C', '#E54666', '#3E63DD', '#978365', '#00A2C7'];
export const colorFor = (id: number) => COLORS[Math.abs(id) % COLORS.length]!;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const chars = parts.length > 1 ? [parts[0]![0], parts[parts.length - 1]![0]] : [...(parts[0] ?? '?')].slice(0, 2);
  return chars.join('').toUpperCase();
}

// ───────────── rich text (links, *bold*, _italic_, ~strike~, `code`, @mentions) ─────────────

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}])/gi;
// Markers only count at word boundaries, so snake_case and 2*3*4 are left alone.
const BEFORE = '(?<![\\p{L}\\p{N}])';
const AFTER = '(?![\\p{L}\\p{N}])';
const marked = (c: string) => `(${BEFORE}${c}[^\\s${c}](?:[^${c}\\n]*[^\\s${c}])?${c}${AFTER})`;
const INLINE_RE = new RegExp(`${marked('\\*')}|${marked('_')}|${marked('~')}|(\`[^\`\\n]+\`)|((?<=^|\\s)@[a-zA-Z0-9_.]{3,30})`, 'gu');

/** Remove the formatting markers and line breaks, for one-line previews. */
export function plainText(text: string): string {
  return text
    .replace(INLINE_RE, (token, b, i, s, code) => (b || i || s || code ? token.slice(1, -1) : token))
    .replace(/\s*\n+\s*/g, ' ');
}

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const token = m[0];
    const key = `${keyBase}-${i++}`;
    if (m[1]) out.push(<strong key={key}>{token.slice(1, -1)}</strong>);
    else if (m[2]) out.push(<em key={key}>{token.slice(1, -1)}</em>);
    else if (m[3]) out.push(<s key={key}>{token.slice(1, -1)}</s>);
    else if (m[4]) out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else
      out.push(
        <span key={key} className="mention">
          {token}
        </span>,
      );
    last = idx + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Render user text safely as React nodes (never as HTML). */
export function richText(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(...inline(text.slice(last, idx), `t${i}`));
    const raw = m[0];
    const href = raw.startsWith('www.') ? `https://${raw}` : raw;
    out.push(
      <a key={`l${i}`} href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
        {raw}
      </a>,
    );
    last = idx + raw.length;
    i++;
  }
  if (last < text.length) out.push(...inline(text.slice(last), `t${i}`));
  return out;
}

/** True when the text is only 1–3 emoji, shown larger like in most messengers. */
export function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 24) return false;
  try {
    const seg = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)].map((s) => s.segment);
    return seg.length <= 3 && seg.every((g) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g));
  } catch {
    return false;
  }
}
