import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Chat, Message } from '../../../shared/types.ts';
import { explainRequest, summarizeRequest, type AiRequest } from '../lib/ai/index.ts';
import { api } from '../lib/api.ts';
import { compactNumber, formatDay, lastSeen } from '../lib/format.tsx';
import { useT } from '../lib/i18n.ts';
import { copyText, inviteUrl } from '../lib/share.ts';
import { getSocket, useStore, type ClientMessage } from '../lib/store.ts';
import { autoTranslate, translateNow, translationOf } from '../lib/translate.ts';
import { AiResultDialog, useAi } from './Ai.tsx';
import { ChatInfo } from './ChatInfo.tsx';
import { Composer } from './Composer.tsx';
import { Confirm, EventDialog, ForwardDialog, PollDialog, ReportDialog, UnlockDialog } from './dialogs.tsx';
import { Icon } from './icons.tsx';
import { MessageRow, previewLine } from './Message.tsx';
import { PrivateTranslationDialog } from './Translate.tsx';
import { ChatAvatar, Empty, IconButton, Menu, QUICK_REACTIONS, Spinner, useMenu, type MenuItem } from './ui.tsx';

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

export function ChatView({ chatId }: { chatId: number }) {
  const t = useT();
  const navigate = useNavigate();
  const me = useStore((s) => s.me)!;
  const lang = useStore((s) => s.lang);
  const chat = useStore((s) => s.chats[chatId]);
  const state = useStore((s) => s.msgs[chatId]);
  const typing = useStore((s) => s.typing[chatId]);
  const connected = useStore((s) => s.connected);
  const e2e = useStore((s) => s.e2e);
  const ai = useAi();
  const [aiTask, setAiTask] = useState<{ title: string; request: AiRequest; source?: string } | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [translateAsk, setTranslateAsk] = useState<ClientMessage | null>(null);
  const { loadMessages, markRead, setActiveChat, fetchChat, upsertChat, patchMessage, hideMessage, error, toast, openShare, send } = useStore.getState();

  const [missing, setMissing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [menu, setMenu] = useState<{ m: ClientMessage; x: number; y: number } | null>(null);
  const [forward, setForward] = useState<Message | null>(null);
  const [report, setReport] = useState<Message | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null);
  const [dialog, setDialog] = useState<'poll' | 'event' | null>(null);
  const [pins, setPins] = useState<Message[]>([]);
  const [pinIndex, setPinIndex] = useState(0);
  const pinTr = useStore((st) => (pins[pinIndex] ? st.tr[pins[pinIndex]!.id] : undefined));
  const [highlight, setHighlight] = useState<number | null>(null);
  const [newBelow, setNewBelow] = useState(0);
  const [showDown, setShowDown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[] | null>(null);
  const [unreadFrom] = useState(() => (chat?.unread ? chat.lastReadId : null));
  const [joining, setJoining] = useState(false);
  const headerMenu = useMenu();

  const listRef = useRef<HTMLDivElement>(null);
  const scrollInfo = useRef({ init: false, height: 0, top: 0, first: null as number | null, last: null as number | null, atBottom: true });
  const pendingJump = useRef<number | null>(null);

  const items = state?.items ?? [];
  const blocked = me.blocked;
  const visible = useMemo(() => items.filter((m) => !blocked.includes(m.userId) || m.userId === me.id), [items, blocked, me.id]);

  // ── open the conversation ──
  useEffect(() => {
    setActiveChat(chatId);
    let cancelled = false;
    (async () => {
      let c: Chat | undefined = useStore.getState().chats[chatId];
      if (!c) c = (await fetchChat(chatId)) ?? undefined;
      if (cancelled) return;
      if (!c) return setMissing(true);
      if (!c.isMember) getSocket()?.emit('watch', chatId);
      const s = useStore.getState().msgs[chatId];
      if (!s?.loaded || s.hasNewer) await loadMessages(chatId, 'latest');
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => setActiveChat(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── pinned messages ──
  const pinSignature = useMemo(() => items.filter((m) => m.pinnedAt).map((m) => `${m.id}:${m.pinnedAt}`).join(','), [items]);
  useEffect(() => {
    if (!state?.loaded) return;
    let cancelled = false;
    api
      .get<{ messages: Message[] }>(`/chats/${chatId}/pins`)
      .then((r) => useStore.getState().openMessages(r.messages))
      .then((opened) => {
        if (cancelled) return;
        setPins(opened);
        setPinIndex(0);
        autoTranslate(opened.filter((m) => !m.enc || m.e2e === 'ok'));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chatId, pinSignature, state?.loaded, e2e]);

  // A contact whose key is no longer the one this device knew: their security code changed.
  const peerId = chat?.peer?.id;
  const keyChanged = useStore((s) => peerId != null && !!s.keyAlerts[peerId]);

  // ── scrolling ──
  const scrollToBottom = (smooth = false) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  const scrollToMessage = useCallback((id: number) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-mid="${id}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    setHighlight(id);
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1800);
    return true;
  }, []);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !state?.loaded) return;
    const info = scrollInfo.current;
    const first = visible[0]?.id ?? null;
    const lastMsg = visible[visible.length - 1];
    const last = lastMsg?.id ?? null;
    if (pendingJump.current != null) {
      if (scrollToMessage(pendingJump.current)) pendingJump.current = null;
      info.init = true;
    } else if (!info.init) {
      info.init = true;
      const divider = el.querySelector<HTMLElement>('.unread-divider');
      if (divider) divider.scrollIntoView({ block: 'center' });
      else el.scrollTop = el.scrollHeight;
    } else if (first !== info.first && last === info.last) {
      // older messages were prepended: keep the viewport where it was
      el.scrollTop = el.scrollHeight - info.height + info.top;
    } else if (last !== info.last) {
      if (info.atBottom || lastMsg?.userId === me.id) el.scrollTop = el.scrollHeight;
      else if (lastMsg && lastMsg.type !== 'system') setNewBelow((n) => n + 1);
    } else if (info.atBottom) {
      el.scrollTop = el.scrollHeight;
    }
    info.height = el.scrollHeight;
    info.top = el.scrollTop;
    info.first = first;
    info.last = last;
    info.atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, [visible, state?.loaded, me.id, scrollToMessage]);

  // The viewport shrinks when the pinned bar, the keyboard or a taller composer appears:
  // stay glued to the latest message if that is where the reader was.
  const hasChat = !!chat;
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const info = scrollInfo.current;
      if (info.init && info.atBottom && pendingJump.current == null) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasChat]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el || !state) return;
    const info = scrollInfo.current;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    info.top = el.scrollTop;
    info.height = el.scrollHeight;
    info.atBottom = fromBottom < 120;
    setShowDown(fromBottom > 400);
    if (info.atBottom && newBelow) setNewBelow(0);
    if (el.scrollTop < 300 && state.hasOlder && !state.loading) void loadMessages(chatId, 'older');
    if (fromBottom < 300 && state.hasNewer && !state.loading) void loadMessages(chatId, 'newer');
    if (info.atBottom) markRead(chatId);
  };

  // Mark as read when new messages land while we are at the bottom.
  useEffect(() => {
    if (state?.loaded && scrollInfo.current.atBottom && document.visibilityState === 'visible') markRead(chatId);
  }, [visible.length, state?.loaded, chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const jumpTo = useCallback(
    async (id: number) => {
      if (scrollToMessage(id)) return;
      pendingJump.current = id;
      await loadMessages(chatId, { around: id });
    },
    [chatId, loadMessages, scrollToMessage],
  );

  const jumpToLatest = async () => {
    setNewBelow(0);
    if (state?.hasNewer) {
      scrollInfo.current.init = false;
      await loadMessages(chatId, 'latest');
    } else scrollToBottom(true);
  };

  // ── search ──
  useEffect(() => {
    if (!searching || query.trim().length < 2) return setResults(null);
    if (chat?.type === 'dm') {
      // The server cannot search what it cannot read: look through the messages decrypted here.
      const needle = query.trim().toLowerCase();
      setResults([...items].reverse().filter((m) => !m.deleted && m.type !== 'system' && m.text.toLowerCase().includes(needle)).slice(0, 40));
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<{ messages: Message[] }>(`/chats/${chatId}/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => !cancelled && setResults(r.messages))
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searching, chatId, chat?.type, items]);

  // ── message actions ──
  const react = useCallback(
    async (m: ClientMessage, emoji: string) => {
      const current = m.reactions.find((r) => r.mine)?.emoji ?? null;
      try {
        await api.post(`/messages/${m.id}/react`, { emoji: current === emoji ? null : emoji });
      } catch (e) {
        error(e);
      }
    },
    [error],
  );

  const onMenu = useCallback((m: ClientMessage, x: number, y: number) => setMenu({ m, x, y }), []);
  const onRetry = useCallback(
    (m: ClientMessage) => {
      hideMessage(m.chatId, m.id);
      void send(m.chatId, { text: m.text, attachment: m.attachment, poll: m.poll && { question: m.poll.question, options: m.poll.options, multiple: m.poll.multiple } });
    },
    [hideMessage, send],
  );

  if (missing) return <Empty emoji="🔍" title={t('chat_not_found')} text={t('chat_not_found_text')} />;
  if (!chat)
    return (
      <div className="center fill">
        <Spinner />
      </div>
    );

  const isAdmin = chat.role === 'owner' || chat.role === 'admin';
  const canPin = chat.isMember && (chat.type === 'dm' || chat.pinPolicy === 'all' || isAdmin);
  const canSend = chat.isMember && (chat.type === 'dm' || chat.sendPolicy === 'all' || isAdmin);
  const dmBlocked = chat.type === 'dm' && chat.peer && blocked.includes(chat.peer.id);

  const typers = Object.entries(typing ?? {})
    .filter(([id]) => Number(id) !== me.id)
    .map(([, v]) => v.name);
  let subtitle: string;
  if (typers.length) subtitle = chat.type === 'dm' ? t('typing') : typers.length === 1 ? t('typing_one', { name: typers[0]! }) : t('typing_many', { n: typers.length });
  else if (chat.type === 'dm') subtitle = chat.peer?.online ? t('online') : chat.peer ? lastSeen(chat.peer.lastSeen, lang, t) : '';
  else subtitle = chat.memberCount > 0 ? `${t('members_n', { n: chat.memberCount, count: compactNumber(chat.memberCount, lang) })} · ${t('public_group')}` : t('public_group');

  const shareGroup = () =>
    chat.inviteCode &&
    openShare({
      title: chat.name,
      text: t('share_group_text', { name: chat.name }),
      url: inviteUrl(chat.inviteCode),
      emoji: chat.emoji,
      subtitle: chat.description,
      cta: t('share_cta_group'),
    });

  const join = async () => {
    setJoining(true);
    try {
      const r = await api.post<{ chat: Chat }>(`/chats/${chat.id}/join`);
      upsertChat(r.chat);
      toast(t('joined_group', { name: chat.name }));
    } catch (e) {
      error(e);
    } finally {
      setJoining(false);
    }
  };

  const setPref = async (patch: { muted?: boolean; pinned?: boolean; archived?: boolean }) => {
    try {
      const r = await api.patch<{ chat: Chat }>(`/chats/${chat.id}/prefs`, patch);
      upsertChat(r.chat);
    } catch (e) {
      error(e);
    }
  };

  const messageMenu = (m: ClientMessage): MenuItem[] => {
    const mine = m.userId === me.id;
    const plain = m.type !== 'poll' && m.type !== 'event';
    return [
      { icon: 'reply', label: t('reply'), onClick: () => (setEditing(null), setReplyTo(m)), hidden: !canSend },
      { icon: 'copy', label: t('copy'), onClick: () => void copyText(m.text).then((ok) => ok && toast(t('copied'))), hidden: !m.text },
      { icon: 'forward', label: t('forward'), onClick: () => setForward(m), hidden: !plain },
      {
        icon: 'pin',
        label: m.pinnedAt ? t('unpin') : t('pin'),
        hidden: !canPin,
        onClick: () => void api.post(`/messages/${m.id}/pin`, { pinned: !m.pinnedAt }).catch(error),
      },
      {
        icon: 'star',
        label: m.starred ? t('unstar') : t('star'),
        onClick: () => {
          patchMessage(m.chatId, m.id, (x) => ({ ...x, starred: !m.starred }));
          void api.post(`/messages/${m.id}/star`, { starred: !m.starred }).catch(error);
        },
      },
      { icon: 'edit', label: t('edit'), onClick: () => (setReplyTo(null), setEditing(m)), hidden: !mine || !plain || !canSend },
      {
        icon: 'globe',
        label: t('ai_translate'),
        hidden: mine || !m.text || m.type === 'event' || m.type === 'poll',
        onClick: () =>
          void translateNow(m).then((result) => {
            // A private message is only shown to a translation service once its reader agreed.
            if (result === 'consent') setTranslateAsk(m);
            else if (result === 'same') toast(t('tr_same'));
            else if (result === 'failed') toast(t('tr_failed'), 'error');
            else if (result === 'unavailable') toast(t('tr_unavailable'), 'error');
          }),
      },
      {
        icon: 'sparkles',
        label: t('ai_explain'),
        hidden: !ai || !m.text,
        onClick: () => setAiTask({ title: t('ai_explain'), request: explainRequest(m.text, lang), source: m.text }),
      },
      {
        icon: 'share',
        label: t('share_outside'),
        hidden: chat.type !== 'group' || !chat.inviteCode || !m.text,
        onClick: () =>
          openShare({
            title: chat.name,
            text: `“${m.text.slice(0, 400)}” — ${m.user.name}, ${chat.name}`,
            url: inviteUrl(chat.inviteCode!),
            emoji: chat.emoji,
            subtitle: m.text.slice(0, 120),
            cta: t('share_cta_group'),
          }),
      },
      { icon: 'flag', label: t('report'), onClick: () => setReport(m), hidden: mine || m.user.isSystem },
      { icon: 'trash', label: t('delete'), danger: true, onClick: () => setConfirmDelete(m) },
    ];
  };

  const pin = pins[pinIndex];
  // The pinned message is shown in my language too, when its translation is there.
  const pinTranslation = translationOf(pinTr, pin?.text ?? '', lang);
  const pinText = (pinTranslation?.state === 'done' && pinTranslation.text) || pin?.text || '';
  const firstUnreadId = unreadFrom != null ? visible.find((m) => m.id > unreadFrom && m.userId !== me.id && m.type !== 'system')?.id : undefined;

  return (
    <div className="chat">
      <div className="chat-main">
        <header className="chat-head">
          <IconButton icon="back" label={t('back')} className="only-mobile" onClick={() => navigate('/chats')} />
          {searching ? (
            <>
              <input className="search-input grow" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search_in_chat')} />
              <IconButton
                icon="x"
                label={t('cancel')}
                onClick={() => {
                  setSearching(false);
                  setQuery('');
                  setResults(null);
                }}
              />
            </>
          ) : (
            <>
              <button type="button" className="chat-title" onClick={() => setInfoOpen(true)}>
                <ChatAvatar chat={chat} size={42} />
                <span className="chat-title-text">
                  <span className="chat-name">
                    {chat.name}
                    {chat.isAnnouncement && <Icon name="megaphone" size={15} />}
                    {chat.muted && <Icon name="bellOff" size={14} />}
                  </span>
                  <span className={`chat-sub ${typers.length ? 'typing' : ''}`}>{subtitle}</span>
                </span>
              </button>
              <IconButton icon="search" label={t('search')} onClick={() => setSearching(true)} />
              {chat.type === 'group' && <IconButton icon="share" label={t('share')} onClick={shareGroup} />}
              <IconButton icon="more" label={t('more')} onClick={headerMenu.openFrom} />
            </>
          )}
        </header>

        {!connected && <div className="banner warn">{t('reconnecting')}</div>}
        {chat.type === 'dm' && e2e !== 'ready' && (
          <button type="button" className="banner error as-button" onClick={() => setUnlocking(true)}>
            🔒 {t('e2e_locked_banner')}
          </button>
        )}
        {chat.type === 'dm' && keyChanged && (
          <button type="button" className="banner warn as-button" onClick={() => (peerId != null && useStore.getState().acknowledgeKey(peerId), setInfoOpen(true))}>
            {t('e2e_key_changed', { name: chat.name })}
          </button>
        )}

        {pin && !searching && (
          <button
            type="button"
            className="pinbar"
            onClick={() => {
              void jumpTo(pin.id);
              setPinIndex((i) => (i + 1) % pins.length);
            }}
          >
            <Icon name="pin" size={17} />
            <span className="pinbar-text">
              <strong>
                {t('pinned_message')}
                {pins.length > 1 && ` ${pinIndex + 1}/${pins.length}`}
              </strong>
              <span dir="auto">{previewLine({ type: pin.type, text: pin.poll?.question ?? (pinText || pin.attachment?.name || ''), deleted: false }, t)}</span>
            </span>
          </button>
        )}

        {searching && results && (
          <div className="search-results">
            {results.length === 0 && <div className="muted pad center">{t('no_results')}</div>}
            {results.map((m) => (
              <button
                key={m.id}
                type="button"
                className="search-result"
                onClick={() => {
                  setSearching(false);
                  setResults(null);
                  setQuery('');
                  void jumpTo(m.id);
                }}
              >
                <strong>{m.user.name}</strong>
                <span className="muted small">{formatDay(m.createdAt, lang, t)}</span>
                <span className="search-snippet" dir="auto">
                  {m.text}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="messages" ref={listRef} onScroll={onScroll}>
          {state?.loading && state.hasOlder && (
            <div className="center pad">
              <Spinner />
            </div>
          )}
          {!state?.loaded && (
            <div className="center fill">
              <Spinner />
            </div>
          )}
          {state?.loaded && !state.hasOlder && chat.type === 'group' && (
            <div className="chat-intro">
              <ChatAvatar chat={chat} size={72} />
              <h3>{chat.name}</h3>
              {chat.description && <p dir="auto">{chat.description}</p>}
              <span className="tag">
                <Icon name="globe" size={14} /> {t('public_group_hint')}
              </span>
            </div>
          )}
          {state?.loaded && !state.hasOlder && chat.type === 'dm' && (
            <div className="chat-intro">
              <span className="tag ok">
                <Icon name="shield" size={14} /> {t('e2e_badge')}
              </span>
              <p>{t('e2e_intro', { name: chat.name })}</p>
            </div>
          )}
          {visible.map((m, i) => {
            const prev = visible[i - 1];
            const next = visible[i + 1];
            const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
            const run = (a: ClientMessage | undefined, b: ClientMessage) =>
              !!a && a.userId === b.userId && a.type !== 'system' && b.type !== 'system' && sameDay(a.createdAt, b.createdAt) && Math.abs(a.createdAt - b.createdAt) < 5 * 60_000;
            return (
              <div key={m.id} className="msg-slot">
                {newDay && (
                  <div className="day">
                    <span>{formatDay(m.createdAt, lang, t)}</span>
                  </div>
                )}
                {m.id === firstUnreadId && (
                  <div className="unread-divider">
                    <span>{t('unread_messages')}</span>
                  </div>
                )}
                <MessageRow
                  m={m}
                  chat={chat}
                  mine={m.userId === me.id}
                  showAuthor={newDay || !run(prev, m)}
                  showAvatar={!next || !run(m, next)}
                  highlighted={highlight === m.id}
                  lang={lang}
                  onMenu={onMenu}
                  onReact={react}
                  onJump={jumpTo}
                  onRetry={onRetry}
                />
              </div>
            );
          })}
        </div>

        {(showDown || newBelow > 0 || state?.hasNewer) && (
          <button type="button" className="jump-down" onClick={() => void jumpToLatest()} aria-label={t('jump_latest')}>
            <Icon name="down" size={22} />
            {newBelow > 0 && <span className="badge">{newBelow}</span>}
          </button>
        )}

        {!chat.isMember ? (
          <div className="joinbar">
            <div>
              <strong>{t('preview_mode')}</strong>
              <span>{t('preview_mode_text')}</span>
            </div>
            <button type="button" className="btn primary" onClick={join} disabled={joining}>
              {t('join_group')}
            </button>
          </div>
        ) : dmBlocked ? (
          <div className="joinbar">
            <span>{t('you_blocked_user')}</span>
          </div>
        ) : !canSend ? (
          <div className="joinbar">
            <Icon name="megaphone" size={18} />
            <span>{t('admins_only_notice')}</span>
          </div>
        ) : (
          <Composer
            chat={chat}
            replyTo={replyTo}
            editing={editing}
            onClearReply={() => setReplyTo(null)}
            onClearEdit={() => setEditing(null)}
            onPoll={() => setDialog('poll')}
            onEvent={() => setDialog('event')}
          />
        )}
      </div>

      {infoOpen && <ChatInfo chat={chat} onClose={() => setInfoOpen(false)} onJump={(id) => (setInfoOpen(false), void jumpTo(id))} />}

      {headerMenu.at && (
        <Menu
          x={headerMenu.at.x}
          y={headerMenu.at.y}
          onClose={headerMenu.close}
          items={[
            { icon: 'info', label: chat.type === 'group' ? t('group_info') : t('profile'), onClick: () => setInfoOpen(true) },
            { icon: 'share', label: t('share_group'), onClick: () => void shareGroup(), hidden: chat.type !== 'group' },
            {
              icon: 'sparkles',
              label: t('ai_summarize'),
              hidden: !ai || visible.filter((m) => m.text).length < 3,
              onClick: () =>
                setAiTask({
                  title: t('ai_summarize'),
                  request: summarizeRequest(
                    visible
                      .filter((m) => m.text && m.type !== 'system' && !m.deleted)
                      .slice(-80)
                      .map((m) => `${m.user.name}: ${m.text}`)
                      .join('\n'),
                    lang,
                  ),
                }),
            },
            { icon: chat.muted ? 'bell' : 'bellOff', label: chat.muted ? t('unmute') : t('mute'), onClick: () => void setPref({ muted: !chat.muted }), hidden: !chat.isMember },
            { icon: 'pin', label: chat.pinned ? t('unpin_chat') : t('pin_chat'), onClick: () => void setPref({ pinned: !chat.pinned }), hidden: !chat.isMember },
            { icon: 'archive', label: chat.archived ? t('unarchive') : t('archive'), onClick: () => void setPref({ archived: !chat.archived }), hidden: !chat.isMember },
          ]}
        />
      )}

      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={messageMenu(menu.m)}
          header={
            chat.isMember ? (
              <div className="menu-reactions">
                {QUICK_REACTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={menu.m.reactions.some((r) => r.mine && r.emoji === e) ? 'active' : ''}
                    onClick={() => {
                      void react(menu.m, e);
                      setMenu(null);
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        />
      )}

      {forward && <ForwardDialog message={forward} onClose={() => setForward(null)} />}
      {report && <ReportDialog targetType="message" targetId={report.id} evidence={report.enc ? report.text : undefined} onClose={() => setReport(null)} />}
      {aiTask && <AiResultDialog title={aiTask.title} request={aiTask.request} source={aiTask.source} onClose={() => setAiTask(null)} />}
      {unlocking && <UnlockDialog onClose={() => setUnlocking(false)} />}
      {translateAsk && <PrivateTranslationDialog message={translateAsk} onClose={() => setTranslateAsk(null)} />}
      {dialog === 'poll' && <PollDialog chatId={chat.id} onClose={() => setDialog(null)} />}
      {dialog === 'event' && <EventDialog chatId={chat.id} onClose={() => setDialog(null)} />}
      {confirmDelete && (
        <DeleteDialog
          message={confirmDelete}
          canDeleteForAll={confirmDelete.userId === me.id || isAdmin}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function DeleteDialog({ message, canDeleteForAll, onClose }: { message: Message; canDeleteForAll: boolean; onClose: () => void }) {
  const t = useT();
  const { error, hideMessage } = useStore.getState();
  const [everyone, setEveryone] = useState(false);
  return (
    <Confirm
      title={t('delete_message')}
      confirmLabel={t('delete')}
      danger
      onClose={onClose}
      onConfirm={async () => {
        try {
          await api.del(`/messages/${message.id}?scope=${everyone ? 'all' : 'me'}`);
          if (!everyone) hideMessage(message.chatId, message.id);
        } catch (e) {
          error(e);
        }
      }}
      text={
        canDeleteForAll ? (
          <label className="switch-row">
            <span>{t('delete_for_everyone')}</span>
            <input type="checkbox" className="switch" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
          </label>
        ) : (
          t('delete_for_me_text')
        )
      }
    />
  );
}
