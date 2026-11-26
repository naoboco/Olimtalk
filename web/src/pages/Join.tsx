import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CATEGORY_EMOJI, WORLD_META } from '../../../shared/data.ts';
import type { Chat, Community, InvitePreview } from '../../../shared/types.ts';
import { categoryKey } from '../components/dialogs.tsx';
import { Icon, Logo } from '../components/icons.tsx';
import { Avatar, ChatAvatar, Empty, Spinner, WorldBadge } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { compactNumber } from '../lib/format.tsx';
import { useT } from '../lib/i18n.ts';
import { IS_NATIVE } from '../lib/platform.ts';
import { inviteUrl } from '../lib/share.ts';
import { useStore } from '../lib/store.ts';

/** On the website, once the apps are published: store buttons and "open in the app". */
function GetTheApp({ code }: { code: string }) {
  const t = useT();
  const config = useStore((s) => s.config);
  if (IS_NATIVE || !config || (!config.appStoreUrl && !config.playStoreUrl)) return null;
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  return (
    <div className="get-app">
      <span className="muted small">{t('get_the_app')}</span>
      <div className="get-app-buttons">
        {config.appStoreUrl && (
          <a className="btn small soft" href={config.appStoreUrl} target="_blank" rel="noopener noreferrer">
            App Store
          </a>
        )}
        {config.playStoreUrl && (
          <a className="btn small soft" href={config.playStoreUrl} target="_blank" rel="noopener noreferrer">
            Google Play
          </a>
        )}
        {touch && (
          <a className="btn small ghost" href={`olimtalk://join/${encodeURIComponent(code)}`}>
            {t('open_in_app')}
          </a>
        )}
      </div>
    </div>
  );
}

/** Public landing page of an invite link — works for visitors without an account. */
export function JoinPage() {
  const t = useT();
  const navigate = useNavigate();
  const { code = '' } = useParams();
  const me = useStore((s) => s.me);
  const lang = useStore((s) => s.lang);
  const { error, upsertChat, loadChats, openShare, setLang } = useStore.getState();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPreview(null);
    setMissing(false);
    api
      .get<InvitePreview>(`/invite/${encodeURIComponent(code)}`)
      .then((p) => {
        setPreview(p);
        // A visitor without an account reads the page in the language of the group.
        const world = p.chat?.world ?? p.community?.world;
        if (!useStore.getState().me && world) setLang(world);
      })
      .catch(() => setMissing(true));
  }, [code, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ kind: 'chat' | 'community'; chat?: Chat; community?: Community }>(`/invite/${encodeURIComponent(code)}/join`);
      if (r.kind === 'chat' && r.chat) {
        upsertChat(r.chat);
        navigate(`/chats/${r.chat.id}`, { replace: true });
      } else if (r.community) {
        await loadChats();
        navigate(`/community/${r.community.id}`, { replace: true });
      }
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  const chat = preview?.chat;
  const community = preview?.community;
  const name = chat?.name ?? community?.name ?? '';
  const description = chat?.description ?? community?.description ?? '';
  const emoji = chat?.emoji ?? community?.emoji ?? '💬';
  const members = chat?.memberCount ?? community?.memberCount ?? 0;
  const world = chat?.world ?? community?.world;
  const isMember = chat?.isMember ?? community?.isMember ?? false;

  const open = () => {
    if (chat) navigate(`/chats/${chat.id}`);
    else if (community) navigate(`/community/${community.id}`);
  };

  return (
    <div className="join-page">
      <button type="button" className="auth-brand" onClick={() => navigate(me ? '/chats' : '/welcome')}>
        <Logo size={44} />
        <span>OlimTalk</span>
      </button>
      <div className="join-card">
        {missing && <Empty emoji="🔗" title={t('invite_invalid')} text={t('invite_invalid_text')} />}
        {!missing && !preview && (
          <div className="center pad">
            <Spinner />
          </div>
        )}
        {preview && (
          <>
            {chat ? <ChatAvatar chat={chat} size={104} /> : <Avatar id={(community?.id ?? 0) + 7} name={name} emoji={emoji} src={community?.avatar} size={104} />}
            <span className="join-kind">{chat ? t('join_invited_group') : t('join_invited_community')}</span>
            <h1 dir="auto">{name}</h1>
            <div className="tags">
              {world && (
                <span className="tag">
                  <WorldBadge world={world} size={16} /> {WORLD_META[world].label}
                </span>
              )}
              {members > 0 && (
                <span className="tag">
                  <Icon name="users" size={14} /> {t('members_n', { n: members, count: compactNumber(members, lang) })}
                </span>
              )}
              {chat && (
                <span className="tag">
                  {CATEGORY_EMOJI[chat.category]} {t(categoryKey(chat.category))}
                </span>
              )}
              <span className="tag">
                <Icon name="globe" size={14} /> {t('public_group')}
              </span>
            </div>
            {description && (
              <p className="join-desc" dir="auto">
                {description}
              </p>
            )}
            {community?.groups && community.groups.length > 0 && (
              <div className="join-groups">
                {community.groups.map((g) => (
                  <span key={g.id} className="tag">
                    {g.emoji} {g.name}
                  </span>
                ))}
              </div>
            )}
            {me ? (
              isMember ? (
                <button type="button" className="btn primary large block" onClick={open}>
                  {t('open')}
                </button>
              ) : (
                <>
                  <button type="button" className="btn primary large block" onClick={() => void join()} disabled={busy}>
                    {busy ? <Spinner size={18} /> : chat ? t('join_group') : t('join_community')}
                  </button>
                  {chat && (
                    <button type="button" className="btn ghost block" onClick={open}>
                      <Icon name="eye" size={18} /> {t('preview_first')}
                    </button>
                  )}
                </>
              )
            ) : (
              <>
                <button type="button" className="btn primary large block" onClick={() => navigate('/welcome', { state: { next: `/join/${code}` } })}>
                  {t('join_create_account')}
                </button>
                <button type="button" className="btn ghost block" onClick={() => navigate('/welcome', { state: { next: `/join/${code}`, mode: 'login' } })}>
                  {t('join_have_account')}
                </button>
              </>
            )}
            <button
              type="button"
              className="btn soft block"
              onClick={() =>
                openShare({
                  title: name,
                  text: chat ? t('share_group_text', { name }) : t('share_community_text', { name }),
                  url: inviteUrl(code),
                  emoji,
                  subtitle: description,
                  cta: t('share_cta_group'),
                })
              }
            >
              <Icon name="share" size={18} /> {t('share')}
            </button>
            <GetTheApp code={code} />
            <p className="muted small center">{t('join_free_note')}</p>
          </>
        )}
      </div>
    </div>
  );
}
