import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { WORLD_META } from '../../../shared/data.ts';
import type { Chat, Lang } from '../../../shared/types.ts';
import { colorFor, initials } from '../lib/format.tsx';
import { useStore } from '../lib/store.ts';
import { Icon, type IconName } from './icons.tsx';

// ───────────── avatars ─────────────

export function Avatar({
  id,
  name,
  src,
  emoji,
  size = 44,
  online,
  ring,
  onClick,
}: {
  id: number;
  name: string;
  src?: string | null;
  emoji?: string;
  size?: number;
  online?: boolean;
  ring?: 'new' | 'seen' | null;
  onClick?: () => void;
}) {
  const style: CSSProperties = { width: size, height: size, fontSize: emoji ? size * 0.5 : size * 0.38 };
  if (!src) style.background = emoji ? `color-mix(in srgb, ${colorFor(id)} 16%, var(--surface))` : colorFor(id);
  const body = (
    <span className={`avatar${ring ? ` ring ring-${ring}` : ''}`} style={style}>
      {src ? <img src={src} alt="" loading="lazy" /> : <span className={emoji ? 'avatar-emoji' : 'avatar-initials'}>{emoji || initials(name)}</span>}
      {online && <span className="avatar-online" />}
    </span>
  );
  if (!onClick) return body;
  return (
    <button type="button" className="avatar-btn" onClick={onClick} aria-label={name}>
      {body}
    </button>
  );
}

export function ChatAvatar({ chat, size = 48 }: { chat: Pick<Chat, 'id' | 'type' | 'name' | 'avatar' | 'emoji' | 'peer'>; size?: number }) {
  if (chat.type === 'dm') return <Avatar id={chat.peer?.id ?? chat.id} name={chat.name} src={chat.avatar} size={size} online={chat.peer?.online} />;
  return <Avatar id={chat.id} name={chat.name} src={chat.avatar} emoji={chat.emoji} size={size} />;
}

export function WorldBadge({ world, size = 22 }: { world: Lang; size?: number }) {
  const meta = WORLD_META[world];
  return (
    <span className="world-badge" style={{ background: meta.color, width: size * 1.35, height: size, fontSize: size * 0.48 }}>
      {meta.code}
    </span>
  );
}

// ───────────── buttons & small bits ─────────────

export function IconButton({
  icon,
  label,
  onClick,
  active,
  size = 22,
  className = '',
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  active?: boolean;
  size?: number;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={`icon-btn ${active ? 'active' : ''} ${className}`} onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Spinner({ size = 22 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="…" />;
}

export function Empty({ emoji, title, text, children }: { emoji: string; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-emoji">{emoji}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`chip ${active ? 'active' : ''}`} onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  );
}

// ───────────── modal / sheet ─────────────

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
  className = '',
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true">
        {title != null && (
          <header className="modal-head">
            <h2>{title}</h2>
            <IconButton icon="x" label="✕" onClick={onClose} />
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// ───────────── popover menu ─────────────

export interface MenuItem {
  icon?: IconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** A menu anchored at a screen position (context menus, "more" buttons). */
export function Menu({ x, y, items, onClose, header }: { x: number; y: number; items: MenuItem[]; onClose: () => void; header?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    setPos({
      left: Math.max(pad, Math.min(x, window.innerWidth - width - pad)),
      top: Math.max(pad, Math.min(y, window.innerHeight - height - pad)),
    });
  }, [x, y]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="menu-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onContextMenu={(e) => e.preventDefault()}>
      <div ref={ref} className="menu" role="menu" style={pos ? { left: pos.left, top: pos.top } : { left: x, top: y, visibility: 'hidden' }}>
        {header}
        {items
          .filter((i) => !i.hidden)
          .map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`menu-item ${item.danger ? 'danger' : ''}`}
              onClick={() => {
                onClose();
                item.onClick();
              }}
            >
              {item.icon && <Icon name={item.icon} size={19} />}
              <span>{item.label}</span>
            </button>
          ))}
      </div>
    </div>,
    document.body,
  );
}

/** Open a Menu from a button click, anchored under the button. */
export function useMenu() {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return {
    at,
    close: () => setAt(null),
    openFrom: (e: React.MouseEvent) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setAt({ x: r.right - 220, y: r.bottom + 6 });
    },
    openAt: (x: number, y: number) => setAt({ x, y }),
  };
}

// ───────────── toasts ─────────────

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  if (!toasts.length) return null;
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </button>
      ))}
    </div>,
    document.body,
  );
}

// ───────────── emoji picker ─────────────

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const EMOJI_GROUPS: { icon: string; list: string }[] = [
  { icon: '😀', list: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🤕 🤢 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬' },
  { icon: '👍', list: '👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 👏 🙌 👐 🤲 💪 ✍️ 💅 👀 🧠 🫶 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 ✨ 🔥 ⭐ 🌟 💫 🎉 🎊 🎁 🏆 🥇' },
  { icon: '🌍', list: '🇮🇱 ✡️ 🕎 🕍 📜 🕯️ 🍷 🍞 🍯 🍎 🌍 🌎 🌏 ✈️ 🛬 🧳 🏠 🏡 🏢 🏥 🏫 🏛️ 🏖️ 🏝️ 🏜️ ⛰️ 🌅 🌄 🌇 🌃 ☀️ 🌤️ ⛅ 🌧️ ⛈️ 🌈 🌙 🌊 🌴 🌵 🌳 🌻 🌹 🌺 🌸 🍀 🚗 🚌 🚆 🚲 🛴 ⛵' },
  { icon: '⚽', list: '⚽ 🏀 🏐 🎾 🏓 🏸 🥊 🥋 🏊 🏄 🚴 🏃 🧘 🏋️ 🤸 ⛹️ 🥾 🧗 🎿 ⛳ 🎯 🎮 🎲 ♟️ 🎸 🎹 🎤 🎧 🎬 🎨 📚 📖 ✏️ 🎓 💼 💻 📱 ☎️ 📧 📎 📌 📍 📅 ⏰ 💡 🔑 🔒 💰 💳 🧾 🩺 💊 ⚖️ 🚀 🛠️' },
  { icon: '🍕', list: '🍕 🍔 🌭 🥙 🧆 🥗 🍲 🍜 🍝 🍣 🥘 🍳 🥐 🥖 🧀 🍗 🥩 🍟 🍿 🍩 🍪 🎂 🍰 🧁 🍫 🍦 🍉 🍇 🍓 🍊 🍋 🍌 🍍 🥑 🍅 🥒 🌶️ 🧄 🫒 ☕ 🍵 🥤 🧃 🍺 🍻 🥂 🍾 🍹' },
];

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [tab, setTab] = useState(0);
  return (
    <div className="emoji-picker">
      <div className="emoji-tabs">
        {EMOJI_GROUPS.map((g, i) => (
          <button key={g.icon} type="button" className={i === tab ? 'active' : ''} onClick={() => setTab(i)}>
            {g.icon}
          </button>
        ))}
      </div>
      <div className="emoji-grid">
        {EMOJI_GROUPS[tab]!.list.split(' ').map((e) => (
          <button key={e} type="button" onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Single-emoji chooser used for group icons. */
export const GROUP_EMOJIS = ['💬', '👋', '🏙️', '🎉', '⚽', '🏃', '🧘', '🎓', '🚀', '💼', '🩺', '⚖️', '🏠', '🔤', '🛍️', '👨‍👩‍👧', '🍷', '🎶', '📚', '✈️', '🐶', '🌱', '💻', '🎨', '🙏', '❤️', '📢', '🌍'];

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
