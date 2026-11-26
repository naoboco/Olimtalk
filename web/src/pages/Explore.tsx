import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CATEGORY_EMOJI, WORLD_META, cityName } from '../../../shared/data.ts';
import { CATEGORIES, type Chat, type ChatCategory, type Community } from '../../../shared/types.ts';
import { CommunityDialog, GroupDialog, categoryKey } from '../components/dialogs.tsx';
import { Icon } from '../components/icons.tsx';
import { Avatar, ChatAvatar, Chip, Empty, IconButton, Spinner } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { compactNumber } from '../lib/format.tsx';
import { useT } from '../lib/i18n.ts';
import { inviteUrl } from '../lib/share.ts';
import { useStore } from '../lib/store.ts';
import { WorldSwitcher } from './Chats.tsx';

export function GroupCard({ chat, onChange }: { chat: Chat; onChange?: (c: Chat) => void }) {
  const t = useT();
  const navigate = useNavigate();
  const lang = useStore((s) => s.lang);
  const { error, upsertChat, toast, openShare } = useStore.getState();
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ chat: Chat }>(`/chats/${chat.id}/join`);
      upsertChat(r.chat);
      onChange?.(r.chat);
      toast(t('joined_group', { name: chat.name }));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card group-card">
      <button type="button" className="group-card-main" onClick={() => navigate(`/chats/${chat.id}`)}>
        <ChatAvatar chat={chat} size={52} />
        <span className="group-card-text">
          <strong dir="auto">
            {chat.name}
            {chat.isAnnouncement && <Icon name="megaphone" size={14} />}
          </strong>
          <small dir="auto">{chat.description}</small>
          <span className="group-card-meta">
            <span>
              <Icon name="users" size={14} /> {t('members_n', { n: chat.memberCount, count: compactNumber(chat.memberCount, lang) })}
            </span>
            <span>
              {CATEGORY_EMOJI[chat.category]} {chat.category === 'city' && chat.city ? cityName(chat.city, lang) : t(categoryKey(chat.category))}
            </span>
          </span>
        </span>
      </button>
      <div className="group-card-actions">
        {chat.isMember ? (
          <button type="button" className="btn small soft" onClick={() => navigate(`/chats/${chat.id}`)}>
            {t('open')}
          </button>
        ) : (
          <button type="button" className="btn small primary" onClick={join} disabled={busy}>
            {t('join')}
          </button>
        )}
        {chat.inviteCode && (
          <IconButton
            icon="share"
            label={t('share')}
            size={18}
            onClick={() =>
              openShare({
                title: chat.name,
                text: t('share_group_text', { name: chat.name }),
                url: inviteUrl(chat.inviteCode!),
                emoji: chat.emoji,
                subtitle: chat.description,
                cta: t('share_cta_group'),
              })
            }
          />
        )}
      </div>
    </div>
  );
}

export function ExplorePage() {
  const t = useT();
  const navigate = useNavigate();
  const me = useStore((s) => s.me)!;
  const lang = useStore((s) => s.lang);
  const error = useStore((s) => s.error);
  const [category, setCategory] = useState<ChatCategory | ''>('');
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<Chat[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<'group' | 'community' | null>(null);

  const load = async (offset: number) => {
    setLoading(true);
    try {
      const r = await api.get<{ groups: Chat[]; communities: Community[]; hasMore: boolean }>(
        `/explore?world=${me.world}&category=${category}&q=${encodeURIComponent(q.trim())}&offset=${offset}`,
      );
      setGroups((prev) => (offset ? [...prev, ...r.groups] : r.groups));
      if (!offset) setCommunities(r.communities);
      setHasMore(r.hasMore);
    } catch (e) {
      error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void load(0), q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [me.world, category, q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <header className="pane-head">
        <h1>{t('tab_explore')}</h1>
        <WorldSwitcher />
        <span className="grow" />
        <button type="button" className="btn small soft" onClick={() => setDialog('community')}>
          <Icon name="megaphone" size={16} /> <span className="hide-narrow">{t('new_community')}</span>
        </button>
        <button type="button" className="btn small primary" onClick={() => setDialog('group')}>
          <Icon name="plus" size={16} /> {t('new_group')}
        </button>
      </header>
      <div className="page-scroll">
        <div className="page-inner">
          <div className="hero-banner">
            <div>
              <h2>{t('explore_title', { world: WORLD_META[me.world].native })}</h2>
              <p>{t('explore_subtitle')}</p>
            </div>
            <span className="hero-emoji">🌍</span>
          </div>

          <div className="search-box big">
            <Icon name="search" size={20} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search_groups')} aria-label={t('search_groups')} />
            {q && <IconButton icon="x" label={t('cancel')} size={16} onClick={() => setQ('')} />}
          </div>

          <div className="chips wrap">
            <Chip active={category === ''} onClick={() => setCategory('')}>
              {t('filter_all')}
            </Chip>
            {CATEGORIES.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                {CATEGORY_EMOJI[c]} {t(categoryKey(c))}
              </Chip>
            ))}
          </div>

          {category === '' && communities.length > 0 && (
            <>
              <h3 className="section-heading">{t('communities')}</h3>
              <div className="community-grid">
                {communities.map((c) => (
                  <button key={c.id} type="button" className="card community-card" onClick={() => navigate(`/community/${c.id}`)}>
                    <Avatar id={c.id + 7} name={c.name} emoji={c.emoji} src={c.avatar} size={56} />
                    <strong dir="auto">{c.name}</strong>
                    <small dir="auto">{c.description}</small>
                    <span className="group-card-meta">
                      <span>{t('groups_n', { n: c.groupCount })}</span>
                      <span>{t('members_n', { n: c.memberCount, count: compactNumber(c.memberCount, lang) })}</span>
                    </span>
                    {c.isMember && <span className="tag ok">✓ {t('joined')}</span>}
                  </button>
                ))}
              </div>
            </>
          )}

          <h3 className="section-heading">{category ? `${CATEGORY_EMOJI[category]} ${t(categoryKey(category))}` : t('public_groups')}</h3>
          <div className="group-grid">
            {groups.map((g) => (
              <GroupCard key={g.id} chat={g} onChange={(c) => setGroups((prev) => prev.map((x) => (x.id === c.id ? c : x)))} />
            ))}
          </div>
          {loading && (
            <div className="center pad">
              <Spinner />
            </div>
          )}
          {!loading && groups.length === 0 && (
            <Empty emoji="🔎" title={t('no_groups_found')} text={t('no_groups_found_text')}>
              <button type="button" className="btn primary" onClick={() => setDialog('group')}>
                <Icon name="plus" size={18} /> {t('new_group')}
              </button>
            </Empty>
          )}
          {hasMore && !loading && (
            <button type="button" className="btn soft block" onClick={() => void load(groups.length)}>
              {t('load_more')}
            </button>
          )}
        </div>
      </div>
      {dialog === 'group' && <GroupDialog onClose={() => setDialog(null)} />}
      {dialog === 'community' && <CommunityDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

export function CommunityPage() {
  const t = useT();
  const navigate = useNavigate();
  const params = useParams();
  const id = Number(params.id);
  const lang = useStore((s) => s.lang);
  const { error, openShare, toast, loadChats } = useStore.getState();
  const [community, setCommunity] = useState<Community | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newGroup, setNewGroup] = useState(false);

  useEffect(() => {
    setCommunity(null);
    setMissing(false);
    api
      .get<{ community: Community }>(`/communities/${id}`)
      .then((r) => setCommunity(r.community))
      .catch(() => setMissing(true));
  }, [id]);

  if (missing) return <Empty emoji="🔍" title={t('chat_not_found')} text={t('chat_not_found_text')} />;
  if (!community)
    return (
      <div className="center fill">
        <Spinner />
      </div>
    );

  const toggle = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ community: Community }>(`/communities/${community.id}/${community.isMember ? 'leave' : 'join'}`);
      setCommunity(r.community);
      if (r.community.isMember) toast(t('joined_group', { name: community.name }));
      void loadChats();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  const isAdmin = community.role === 'owner' || community.role === 'admin';
  const announcements = community.groups?.filter((g) => g.isAnnouncement) ?? [];
  const groups = community.groups?.filter((g) => !g.isAnnouncement) ?? [];
  const update = (c: Chat) => setCommunity((prev) => (prev ? { ...prev, groups: prev.groups?.map((g) => (g.id === c.id ? c : g)), isMember: true } : prev));

  return (
    <div className="page">
      <header className="pane-head">
        <IconButton icon="back" label={t('back')} onClick={() => navigate('/explore')} />
        <h1>{t('community')}</h1>
        <span className="grow" />
        <IconButton
          icon="share"
          label={t('share')}
          onClick={() =>
            openShare({
              title: community.name,
              text: t('share_community_text', { name: community.name }),
              url: inviteUrl(community.inviteCode),
              emoji: community.emoji,
              subtitle: community.description,
              cta: t('share_cta_group'),
            })
          }
        />
      </header>
      <div className="page-scroll">
        <div className="page-inner">
          <div className="community-hero">
            <Avatar id={community.id + 7} name={community.name} emoji={community.emoji} src={community.avatar} size={88} />
            <div className="community-hero-text">
              <h2 dir="auto">{community.name}</h2>
              <p dir="auto">{community.description}</p>
              <span className="group-card-meta">
                <span>{t('groups_n', { n: community.groupCount })}</span>
                <span>{t('members_n', { n: community.memberCount, count: compactNumber(community.memberCount, lang) })}</span>
                <span>
                  <Icon name="globe" size={14} /> {t('public_group')}
                </span>
              </span>
            </div>
            <div className="community-hero-actions">
              <button type="button" className={`btn ${community.isMember ? 'soft' : 'primary'}`} onClick={toggle} disabled={busy}>
                {community.isMember ? `✓ ${t('joined')}` : t('join_community')}
              </button>
              {isAdmin && (
                <button type="button" className="btn soft" onClick={() => setNewGroup(true)}>
                  <Icon name="plus" size={18} /> {t('add_group')}
                </button>
              )}
            </div>
          </div>

          {announcements.length > 0 && (
            <>
              <h3 className="section-heading">📢 {t('announcements')}</h3>
              <div className="group-grid">
                {announcements.map((g) => (
                  <GroupCard key={g.id} chat={g} onChange={update} />
                ))}
              </div>
            </>
          )}
          <h3 className="section-heading">{t('groups_of_community')}</h3>
          <div className="group-grid">
            {groups.map((g) => (
              <GroupCard key={g.id} chat={g} onChange={update} />
            ))}
          </div>
          {groups.length === 0 && <p className="muted center pad">{t('community_no_groups')}</p>}
        </div>
      </div>
      {newGroup && <GroupDialog community={community} onClose={() => setNewGroup(false)} />}
    </div>
  );
}
