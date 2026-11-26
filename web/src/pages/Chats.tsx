import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WORLD_META } from '../../../shared/data.ts';
import { WORLDS, type Chat, type UserPublic } from '../../../shared/types.ts';
import { ChatView } from '../components/ChatView.tsx';
import { CommunityDialog, GroupDialog } from '../components/dialogs.tsx';
import { Icon, Logo } from '../components/icons.tsx';
import { previewLine } from '../components/Message.tsx';
import { StoriesStrip } from '../components/Stories.tsx';
import { Avatar, ChatAvatar, Chip, Empty, IconButton, Menu, Spinner, WorldBadge, useMenu } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { formatListTime } from '../lib/format.tsx';
import { useT } from '../lib/i18n.ts';
import { useStore } from '../lib/store.ts';

type Filter = 'all' | 'unread' | 'groups' | 'dms';

export function WorldSwitcher() {
  const t = useT();
  const me = useStore((s) => s.me)!;
  const { switchWorld, error } = useStore.getState();
  const menu = useMenu();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className="world-switch" onClick={menu.openFrom} disabled={busy} aria-label={t('switch_world')} title={t('switch_world')}>
        <WorldBadge world={me.world} size={20} />
        {busy ? <Spinner size={14} /> : <Icon name="down" size={15} />}
      </button>
      {menu.at && (
        <Menu
          x={menu.at.x + 120}
          y={menu.at.y}
          onClose={menu.close}
          header={<div className="menu-title">{t('switch_world')}</div>}
          items={WORLDS.map((w) => ({
            label: `${WORLD_META[w].code} · ${WORLD_META[w].label}${w === me.world ? '  ✓' : ''}`,
            onClick: async () => {
              setBusy(true);
              try {
                await switchWorld(w);
              } catch (e) {
                error(e);
              } finally {
                setBusy(false);
              }
            },
          }))}
        />
      )}
    </>
  );
}

function ChatRow({ chat, active }: { chat: Chat; active: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const lang = useStore((s) => s.lang);
  const meId = useStore((s) => s.me?.id);
  const myWorld = useStore((s) => s.me?.world);
  const typing = useStore((s) => s.typing[chat.id]);
  const typers = Object.entries(typing ?? {}).filter(([id]) => Number(id) !== meId);
  const translation = useStore((s) => (chat.lastMessage ? s.tr[chat.lastMessage.id] : undefined));
  let last = chat.lastMessage;
  // Shown in my language when its translation is there.
  if (last && translation?.state === 'done' && translation.text && translation.source === last.text && translation.lang === lang) last = { ...last, text: translation.text };
  let preview = '';
  if (typers.length) preview = chat.type === 'dm' ? t('typing') : t('typing_one', { name: typers[0]![1].name });
  else if (last) {
    const line = previewLine(last, t);
    const prefix = last.type === 'system' ? '' : last.userId === meId ? `${t('you')}: ` : chat.type === 'group' ? `${last.userName.split(' ')[0]}: ` : '';
    preview = prefix + line;
  } else preview = chat.description;
  return (
    <button type="button" className={`chat-row ${active ? 'active' : ''}`} onClick={() => navigate(`/chats/${chat.id}`)}>
      <ChatAvatar chat={chat} size={52} />
      <span className="chat-row-main">
        <span className="chat-row-top">
          <span className="chat-row-name" dir="auto">
            {chat.name}
          </span>
          {chat.isAnnouncement && <Icon name="megaphone" size={14} className="dim" />}
          {chat.type === 'group' && chat.world && chat.world !== myWorld && <WorldBadge world={chat.world} size={15} />}
          <span className={`chat-row-time ${chat.unread ? 'unread' : ''}`}>{formatListTime(last?.createdAt ?? chat.lastActivity, lang, t)}</span>
        </span>
        <span className="chat-row-bottom">
          <span className={`chat-row-preview ${typers.length ? 'typing' : ''}`} dir="auto">
            {preview}
          </span>
          {chat.muted && <Icon name="bellOff" size={15} className="dim" />}
          {chat.pinned && <Icon name="pin" size={15} className="dim" />}
          {chat.unread > 0 && <span className={`badge ${chat.muted ? 'muted' : ''}`}>{chat.unread > 99 ? '99+' : chat.unread}</span>}
        </span>
      </span>
    </button>
  );
}

function ChatList({ activeId }: { activeId: number | null }) {
  const t = useT();
  const navigate = useNavigate();
  const chats = useStore((s) => s.chats);
  const loaded = useStore((s) => s.chatsLoaded);
  const { error, upsertChat, openProfile } = useStore.getState();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [people, setPeople] = useState<UserPublic[]>([]);
  const [dialog, setDialog] = useState<'group' | 'community' | null>(null);
  const newMenu = useMenu();

  // One inbox for every world. Private conversations and announcement groups show up
  // once they hold a message (admins always see their announcement groups).
  const mine = useMemo(
    () =>
      Object.values(chats).filter((c) => {
        if (!c.isMember) return false;
        if (c.lastMessage || c.id === activeId) return true;
        if (c.type === 'dm') return false;
        return !c.isAnnouncement || c.role === 'owner' || c.role === 'admin';
      }),
    [chats, activeId],
  );
  const archivedCount = mine.filter((c) => c.archived).length;
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return mine
      .filter((c) => (needle ? true : showArchived ? c.archived : !c.archived))
      .filter((c) => !needle || c.name.toLowerCase().includes(needle))
      .filter((c) => (filter === 'unread' ? c.unread > 0 : filter === 'groups' ? c.type === 'group' : filter === 'dms' ? c.type === 'dm' : true))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastActivity - a.lastActivity);
  }, [mine, q, filter, showArchived]);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) return setPeople([]);
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<{ users: UserPublic[] }>(`/users/search?q=${encodeURIComponent(needle)}`)
        .then((r) => !cancelled && setPeople(r.users))
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const startDm = async (userId: number) => {
    try {
      const r = await api.post<{ chat: Chat }>('/dm', { userId });
      upsertChat(r.chat);
      setQ('');
      navigate(`/chats/${r.chat.id}`);
    } catch (e) {
      error(e);
    }
  };

  return (
    <div className="pane list-pane">
      <header className="pane-head">
        <div className="brand only-mobile">
          <Logo size={30} />
        </div>
        <h1>{t('tab_chats')}</h1>
        <WorldSwitcher />
        <span className="grow" />
        <IconButton icon="sparkles" label={t('ai_assistant')} onClick={() => navigate('/assistant')} />
        <IconButton icon="plus" label={t('new_chat')} onClick={newMenu.openFrom} className="accent" />
      </header>
      <div className="pane-search">
        <div className="search-box">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search_chats')} aria-label={t('search_chats')} />
          {q && <IconButton icon="x" label={t('cancel')} size={16} onClick={() => setQ('')} />}
        </div>
      </div>
      <div className="pane-scroll">
        {!q && <StoriesStrip />}
        {!q && (
          <div className="chips pad-x">
            {(['all', 'unread', 'groups', 'dms'] as Filter[]).map((f) => (
              <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                {t(`filter_${f}`)}
              </Chip>
            ))}
          </div>
        )}
        {!q && archivedCount > 0 && (
          <button type="button" className="archived-row" onClick={() => setShowArchived((v) => !v)}>
            <Icon name={showArchived ? 'back' : 'archive'} size={18} />
            {showArchived ? t('back_to_chats') : t('archived_n', { n: archivedCount })}
          </button>
        )}
        {!loaded && (
          <div className="center pad">
            <Spinner />
          </div>
        )}
        {list.map((c) => (
          <ChatRow key={c.id} chat={c} active={c.id === activeId} />
        ))}
        {loaded && list.length === 0 && !q && (
          <Empty emoji="💬" title={t('no_chats')} text={t('no_chats_text')}>
            <button type="button" className="btn primary" onClick={() => navigate('/explore')}>
              <Icon name="compass" size={18} /> {t('explore_groups')}
            </button>
          </Empty>
        )}
        {q && people.length > 0 && (
          <>
            <div className="section-title pad-x">{t('people')}</div>
            {people.map((u) => (
              <div key={u.id} className="chat-row as-div">
                <Avatar id={u.id} name={u.name} src={u.avatar} size={48} online={u.online} onClick={() => openProfile(u.id)} />
                <button type="button" className="chat-row-main" onClick={() => void startDm(u.id)}>
                  <span className="chat-row-name">{u.name}</span>
                  <span className="chat-row-preview">@{u.username}</span>
                </button>
              </div>
            ))}
          </>
        )}
        {q && list.length === 0 && people.length === 0 && <div className="muted center pad">{t('no_results')}</div>}
      </div>
      {newMenu.at && (
        <Menu
          x={newMenu.at.x}
          y={newMenu.at.y}
          onClose={newMenu.close}
          items={[
            { icon: 'users', label: t('new_group'), onClick: () => setDialog('group') },
            { icon: 'megaphone', label: t('new_community'), onClick: () => setDialog('community') },
            { icon: 'compass', label: t('explore_groups'), onClick: () => navigate('/explore') },
          ]}
        />
      )}
      {dialog === 'group' && <GroupDialog onClose={() => setDialog(null)} />}
      {dialog === 'community' && <CommunityDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

export function ChatsPage() {
  const t = useT();
  const params = useParams();
  const chatId = params.chatId ? Number(params.chatId) : null;
  const valid = chatId != null && Number.isSafeInteger(chatId) && chatId > 0;
  return (
    <div className={`split ${valid ? 'has-detail' : ''}`}>
      <ChatList activeId={valid ? chatId : null} />
      <div className="pane detail-pane">
        {valid ? (
          <ChatView key={chatId} chatId={chatId} />
        ) : (
          <div className="placeholder">
            <Logo size={84} />
            <h2>OlimTalk</h2>
            <p>{t('placeholder_text')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
