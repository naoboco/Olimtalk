import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORY_EMOJI, PROFILE_EMOJI, cityName } from '../../../shared/data.ts';
import type { Chat, Member, Message } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';
import { compactNumber, lastSeen, richText } from '../lib/format.tsx';
import { useT } from '../lib/i18n.ts';
import { asset } from '../lib/platform.ts';
import { copyText, inviteUrl } from '../lib/share.ts';
import { useStore } from '../lib/store.ts';
import { Confirm, GroupDialog, ReportDialog, categoryKey, profileKey } from './dialogs.tsx';
import { Icon } from './icons.tsx';
import { previewLine } from './Message.tsx';
import { SafetyCode } from './Security.tsx';
import { Avatar, ChatAvatar, IconButton, Menu, Spinner, useDismiss, type MenuItem } from './ui.tsx';

export function ChatInfo({ chat, onClose, onJump }: { chat: Chat; onClose: () => void; onJump: (messageId: number) => void }) {
  const t = useT();
  const navigate = useNavigate();
  const lang = useStore((s) => s.lang);
  const me = useStore((s) => s.me)!;
  const { error, toast, upsertChat, patchChat, removeChat, openShare, openProfile, openLightbox, setMe } = useStore.getState();
  const [members, setMembers] = useState<Member[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState<Message[]>([]);
  const [pins, setPins] = useState<Message[]>([]);
  const [edit, setEdit] = useState(false);
  const [report, setReport] = useState(false);
  const [confirm, setConfirm] = useState<'leave' | 'delete' | 'reset' | null>(null);
  const [memberMenu, setMemberMenu] = useState<{ m: Member; x: number; y: number } | null>(null);

  useDismiss(onClose);
  const group = chat.type === 'group';
  const isAdmin = chat.role === 'owner' || chat.role === 'admin';
  const link = chat.inviteCode ? inviteUrl(chat.inviteCode) : '';

  const loadMembers = async (offset = 0, query = q) => {
    if (!group) return;
    setLoading(true);
    try {
      const r = await api.get<{ members: Member[]; hasMore: boolean }>(`/chats/${chat.id}/members?offset=${offset}&q=${encodeURIComponent(query)}`);
      setMembers((prev) => (offset ? [...prev, ...r.members] : r.members));
      setHasMore(r.hasMore);
    } catch (e) {
      error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void loadMembers(0, q), q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [chat.id, q, chat.memberCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api
      .get<{ messages: Message[] }>(`/chats/${chat.id}/media`)
      .then((r) => setMedia(r.messages))
      .catch(() => undefined);
    api
      .get<{ messages: Message[] }>(`/chats/${chat.id}/pins`)
      .then((r) => useStore.getState().openMessages(r.messages))
      .then(setPins)
      .catch(() => undefined);
  }, [chat.id]);

  const share = () =>
    openShare({
      title: chat.name,
      text: t('share_group_text', { name: chat.name }),
      url: link,
      emoji: chat.emoji,
      subtitle: chat.description,
      cta: t('share_cta_group'),
    });

  // Switches respond immediately; the change is rolled back if the server refuses it.
  const setPref = async (patch: { muted?: boolean; pinned?: boolean }) => {
    const previous = { muted: chat.muted, pinned: chat.pinned };
    patchChat(chat.id, patch);
    try {
      const r = await api.patch<{ chat: Chat }>(`/chats/${chat.id}/prefs`, patch);
      upsertChat(r.chat);
    } catch (e) {
      patchChat(chat.id, previous);
      error(e);
    }
  };

  const setPolicy = async (patch: { sendPolicy?: 'all' | 'admins'; pinPolicy?: 'all' | 'admins' }) => {
    const previous = { sendPolicy: chat.sendPolicy, pinPolicy: chat.pinPolicy };
    patchChat(chat.id, patch);
    try {
      const r = await api.patch<{ chat: Chat }>(`/chats/${chat.id}`, patch);
      upsertChat(r.chat);
    } catch (e) {
      patchChat(chat.id, previous);
      error(e);
    }
  };

  const memberItems = (m: Member): MenuItem[] => [
    { icon: 'user', label: t('view_profile'), onClick: () => openProfile(m.user.id) },
    {
      icon: 'shield',
      label: m.role === 'admin' ? t('remove_admin') : t('make_admin'),
      hidden: !isAdmin || m.role === 'owner' || m.user.id === me.id,
      onClick: async () => {
        try {
          await api.patch(`/chats/${chat.id}/members/${m.user.id}`, { role: m.role === 'admin' ? 'member' : 'admin' });
          void loadMembers();
        } catch (e) {
          error(e);
        }
      },
    },
    {
      icon: 'trash',
      label: t('remove_member'),
      danger: true,
      hidden: !isAdmin || m.role === 'owner' || m.user.id === me.id,
      onClick: async () => {
        try {
          await api.del(`/chats/${chat.id}/members/${m.user.id}`);
          setMembers((prev) => prev.filter((x) => x.user.id !== m.user.id));
        } catch (e) {
          error(e);
        }
      },
    },
  ];

  const images = media.filter((m) => m.attachment && (m.attachment.kind === 'image' || m.attachment.kind === 'video'));
  const peer = chat.peer;
  const peerBlocked = !!peer && me.blocked.includes(peer.id);

  return (
    <aside className="info">
      <header className="chat-head">
        <IconButton icon="x" label={t('close')} onClick={onClose} />
        <h2>{group ? t('group_info') : t('profile')}</h2>
        {group && isAdmin && <IconButton icon="edit" label={t('edit_group')} onClick={() => setEdit(true)} />}
      </header>
      <div className="info-body">
        <section className="info-hero">
          <ChatAvatar chat={chat} size={96} />
          <h3 dir="auto">{chat.name}</h3>
          {group ? (
            <div className="muted">
              {t('public_group')}
              {chat.memberCount > 0 && ` · ${t('members_n', { n: chat.memberCount, count: compactNumber(chat.memberCount, lang) })}`}
            </div>
          ) : (
            peer && (
              <div className="muted">
                @{peer.username} · {peer.online ? t('online') : lastSeen(peer.lastSeen, lang, t)}
              </div>
            )
          )}
          <div className="tags">
            {group && (
              <span className="tag">
                {CATEGORY_EMOJI[chat.category]} {t(categoryKey(chat.category))}
              </span>
            )}
            {group && chat.city && <span className="tag">📍 {cityName(chat.city, lang)}</span>}
            {group && chat.profile && (
              <span className="tag">
                {PROFILE_EMOJI[chat.profile]} {t(profileKey(chat.profile))}
              </span>
            )}
            {peer?.profile && (
              <span className="tag">
                {PROFILE_EMOJI[peer.profile]} {t(profileKey(peer.profile))}
              </span>
            )}
            {peer?.city && <span className="tag">📍 {cityName(peer.city, lang)}</span>}
          </div>
          {(group ? chat.description : peer?.bio) && (
            <p className="info-desc" dir="auto">
              {richText(group ? chat.description : (peer?.bio ?? ''))}
            </p>
          )}
        </section>

        {group && chat.communityId && (
          <button type="button" className="info-row link" onClick={() => navigate(`/community/${chat.communityId}`)}>
            <Icon name="users" size={20} />
            <span>
              <strong>{chat.communityName}</strong>
              <small>{t('part_of_community')}</small>
            </span>
            <Icon name="right" size={18} />
          </button>
        )}

        {group && link && (
          <section className="info-section">
            <div className="section-title">{t('invite_link')}</div>
            <div className="invite">
              <Icon name="link" size={18} />
              <span className="invite-url">{link.replace(/^https?:\/\//, '')}</span>
            </div>
            <div className="info-actions">
              <button type="button" className="btn primary" onClick={share}>
                <Icon name="share" size={18} /> {t('share')}
              </button>
              <button type="button" className="btn soft" onClick={() => void copyText(link).then((ok) => ok && toast(t('link_copied')))}>
                <Icon name="copy" size={18} /> {t('copy_link')}
              </button>
              {isAdmin && (
                <button type="button" className="btn ghost" onClick={() => setConfirm('reset')}>
                  <Icon name="refresh" size={18} /> {t('reset_link')}
                </button>
              )}
            </div>
            <p className="muted small">{t('invite_link_hint')}</p>
          </section>
        )}

        {!group && peer && <SafetyCode peerKey={peer.publicKey} peerName={peer.name} />}

        {chat.isMember && (
          <section className="info-section">
            <label className="switch-row">
              <span>
                <Icon name="bellOff" size={18} /> {t('mute')}
              </span>
              <input type="checkbox" className="switch" checked={chat.muted} onChange={(e) => void setPref({ muted: e.target.checked })} />
            </label>
            <label className="switch-row">
              <span>
                <Icon name="pin" size={18} /> {t('pin_chat')}
              </span>
              <input type="checkbox" className="switch" checked={chat.pinned} onChange={(e) => void setPref({ pinned: e.target.checked })} />
            </label>
          </section>
        )}

        {group && isAdmin && (
          <section className="info-section">
            <div className="section-title">{t('admin_settings')}</div>
            <label className="switch-row">
              <span>{t('only_admins_send')}</span>
              <input type="checkbox" className="switch" checked={chat.sendPolicy === 'admins'} onChange={(e) => void setPolicy({ sendPolicy: e.target.checked ? 'admins' : 'all' })} />
            </label>
            <label className="switch-row">
              <span>{t('everyone_can_pin')}</span>
              <input type="checkbox" className="switch" checked={chat.pinPolicy === 'all'} onChange={(e) => void setPolicy({ pinPolicy: e.target.checked ? 'all' : 'admins' })} />
            </label>
          </section>
        )}

        {pins.length > 0 && (
          <section className="info-section">
            <div className="section-title">
              {t('pinned_messages')} · {pins.length}
            </div>
            {pins.map((m) => (
              <button key={m.id} type="button" className="info-row link" onClick={() => onJump(m.id)}>
                <Icon name="pin" size={18} />
                <span>
                  <strong>{m.user.name}</strong>
                  <small dir="auto">{previewLine({ type: m.type, text: m.poll?.question ?? (m.text || m.attachment?.name || ''), deleted: false }, t)}</small>
                </span>
              </button>
            ))}
          </section>
        )}

        {images.length > 0 && (
          <section className="info-section">
            <div className="section-title">{t('media')}</div>
            <div className="media-grid">
              {images.slice(0, 12).map((m) => (
                <button key={m.id} type="button" onClick={() => openLightbox(m.attachment)}>
                  {m.attachment!.kind === 'image' ? (
                    <img src={asset(m.attachment!.url)} alt="" loading="lazy" />
                  ) : (
                    <video src={asset(m.attachment!.url)} preload="metadata" muted />
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {group && (
          <section className="info-section">
            <div className="section-title">{t('members_n', { n: chat.memberCount, count: compactNumber(chat.memberCount, lang) })}</div>
            <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search_members')} />
            <div className="member-list">
              {members.map((m) => (
                <button
                  key={m.user.id}
                  type="button"
                  className="member"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setMemberMenu({ m, x: r.left + 60, y: r.top + 40 });
                  }}
                >
                  <Avatar id={m.user.id} name={m.user.name} src={m.user.avatar} size={40} online={m.user.online} />
                  <span className="member-text">
                    <strong>
                      {m.user.name}
                      {m.user.id === me.id && ` (${t('you')})`}
                    </strong>
                    <small>
                      {m.user.profile ? `${PROFILE_EMOJI[m.user.profile]} ${t(profileKey(m.user.profile))}` : `@${m.user.username}`}
                      {m.user.city ? ` · ${cityName(m.user.city, lang)}` : ''}
                    </small>
                  </span>
                  {m.role !== 'member' && <span className="role">{m.role === 'owner' ? t('role_owner') : t('role_admin')}</span>}
                </button>
              ))}
              {loading && (
                <div className="center pad">
                  <Spinner />
                </div>
              )}
              {!loading && members.length === 0 && <div className="muted pad center">{chat.memberCount === 0 ? t('be_first_member') : t('no_results')}</div>}
              {hasMore && !loading && (
                <button type="button" className="btn ghost block" onClick={() => void loadMembers(members.length)}>
                  {t('load_more')}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="info-section">
          {group && chat.isMember && (
            <button type="button" className="info-row danger" onClick={() => setConfirm('leave')}>
              <Icon name="logout" size={20} /> {t('leave_group')}
            </button>
          )}
          {!group && peer && (
            <button
              type="button"
              className="info-row danger"
              onClick={async () => {
                try {
                  const r = peerBlocked ? await api.del<{ me: typeof me }>(`/users/${peer.id}/block`) : await api.post<{ me: typeof me }>(`/users/${peer.id}/block`);
                  setMe(r.me);
                } catch (e) {
                  error(e);
                }
              }}
            >
              <Icon name="block" size={20} /> {peerBlocked ? t('unblock') : t('block')}
            </button>
          )}
          <button type="button" className="info-row danger" onClick={() => setReport(true)}>
            <Icon name="flag" size={20} /> {group ? t('report_group') : t('report')}
          </button>
          {group && (chat.role === 'owner' || me.isAdmin) && (
            <button type="button" className="info-row danger" onClick={() => setConfirm('delete')}>
              <Icon name="trash" size={20} /> {t('delete_group')}
            </button>
          )}
        </section>
      </div>

      {memberMenu && <Menu x={memberMenu.x} y={memberMenu.y} items={memberItems(memberMenu.m)} onClose={() => setMemberMenu(null)} />}
      {edit && <GroupDialog chat={chat} onClose={() => setEdit(false)} />}
      {report && <ReportDialog targetType={group ? 'chat' : 'user'} targetId={group ? chat.id : (peer?.id ?? 0)} onClose={() => setReport(false)} />}
      {confirm === 'leave' && (
        <Confirm
          title={t('leave_group')}
          text={t('leave_group_text', { name: chat.name })}
          confirmLabel={t('leave_group')}
          danger
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            try {
              await api.post(`/chats/${chat.id}/leave`);
              removeChat(chat.id);
              navigate('/chats');
            } catch (e) {
              error(e);
            }
          }}
        />
      )}
      {confirm === 'delete' && (
        <Confirm
          title={t('delete_group')}
          text={t('delete_group_text', { name: chat.name })}
          confirmLabel={t('delete')}
          danger
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            try {
              await api.del(`/chats/${chat.id}`);
              removeChat(chat.id);
              navigate('/chats');
            } catch (e) {
              error(e);
            }
          }}
        />
      )}
      {confirm === 'reset' && (
        <Confirm
          title={t('reset_link')}
          text={t('reset_link_text')}
          confirmLabel={t('reset_link')}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            try {
              const r = await api.post<{ chat: Chat }>(`/chats/${chat.id}/invite/reset`);
              upsertChat(r.chat);
              toast(t('link_reset_done'));
            } catch (e) {
              error(e);
            }
          }}
        />
      )}
    </aside>
  );
}
