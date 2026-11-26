import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Chat, Story, UserPublic } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';
import { timeAgo } from '../lib/format.tsx';
import { useT } from '../lib/i18n.ts';
import { uploadFile } from '../lib/media.ts';
import { canShareFiles, nativeShare } from '../lib/share.ts';
import { useStore } from '../lib/store.ts';
import { ReportDialog } from './dialogs.tsx';
import { Icon } from './icons.tsx';
import { Avatar, IconButton, Modal, Spinner } from './ui.tsx';

const BACKGROUNDS = [
  'linear-gradient(135deg,#2F6BFF,#12A594)',
  'linear-gradient(135deg,#F08C00,#E5484D)',
  'linear-gradient(135deg,#8E4EC6,#2F6BFF)',
  'linear-gradient(135deg,#12A594,#FFC53D)',
  'linear-gradient(135deg,#D6409F,#F08C00)',
  'linear-gradient(135deg,#1B1F2A,#3E63DD)',
];
// Only our own gradients may be used as a CSS background for someone else's story.
const safeBg = (bg: string) => (BACKGROUNDS.includes(bg) ? bg : BACKGROUNDS[0]!);

// ───────────── strip shown above the conversation list ─────────────

export function StoriesStrip() {
  const t = useT();
  const me = useStore((s) => s.me)!;
  const groups = useStore((s) => s.stories);
  const openStories = useStore((s) => s.openStories);
  const [composing, setComposing] = useState(false);
  const mine = groups.find((g) => g.user.id === me.id);
  const others = groups.filter((g) => g.user.id !== me.id);
  return (
    <div className="stories">
      <div className="story-chip">
        <div className="story-mine">
          <Avatar
            id={me.id}
            name={me.name}
            src={me.avatar}
            size={56}
            ring={mine ? 'seen' : null}
            onClick={() => (mine ? openStories(me.id) : setComposing(true))}
          />
          <button type="button" className="story-add" onClick={() => setComposing(true)} aria-label={t('story_add')}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        <span>{t('story_mine')}</span>
      </div>
      {others.map((g) => (
        <div key={g.user.id} className="story-chip">
          <Avatar id={g.user.id} name={g.user.name} src={g.user.avatar} size={56} ring={g.allViewed ? 'seen' : 'new'} onClick={() => openStories(g.user.id)} />
          <span>{g.user.name.split(' ')[0]}</span>
        </div>
      ))}
      {others.length === 0 && <div className="stories-empty">{t('stories_empty')}</div>}
      {composing && <StoryComposer onClose={() => setComposing(false)} />}
    </div>
  );
}

// ───────────── composer ─────────────

function StoryComposer({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { error, loadStories, toast } = useStore.getState();
  const [text, setText] = useState('');
  const [bg, setBg] = useState(BACKGROUNDS[0]!);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const publish = async () => {
    setBusy(true);
    try {
      const media = file ? await uploadFile(file) : null;
      await api.post('/stories', { text, bg, media });
      await loadStories();
      toast(t('story_published'));
      onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t('story_new')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn soft" onClick={() => input.current?.click()}>
            <Icon name="image" size={18} /> {t('story_photo')}
          </button>
          <button type="button" className="btn primary" onClick={publish} disabled={busy || (!text.trim() && !file)}>
            {busy ? <Spinner size={16} /> : <Icon name="send" size={18} />} {t('story_publish')}
          </button>
        </>
      }
    >
      <div className="story-canvas" style={{ background: file ? '#000' : bg }}>
        {preview && (file?.type.startsWith('video/') ? <video src={preview} muted autoPlay loop playsInline /> : <img src={preview} alt="" />)}
        <textarea
          className={file ? 'caption' : ''}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={file ? 200 : 700}
          placeholder={file ? t('add_caption') : t('story_text_ph')}
          dir="auto"
          autoFocus
        />
        {file && <IconButton icon="x" label={t('remove_photo')} className="story-remove" onClick={() => setFile(null)} />}
      </div>
      {!file && (
        <div className="swatches">
          {BACKGROUNDS.map((b) => (
            <button key={b} type="button" className={b === bg ? 'active' : ''} style={{ background: b }} onClick={() => setBg(b)} aria-label="background" />
          ))}
        </div>
      )}
      <p className="muted small">{t('story_hint')}</p>
      <input ref={input} type="file" accept="image/*,video/*" hidden onChange={(e) => (setFile(e.target.files?.[0] ?? null), (e.target.value = ''))} />
    </Modal>
  );
}

// ───────────── full-screen viewer ─────────────

const DURATION = 6000;

export function StoryViewer() {
  const t = useT();
  const navigate = useNavigate();
  const viewer = useStore((s) => s.storyViewer);
  const groups = useStore((s) => s.stories);
  const me = useStore((s) => s.me);
  const lang = useStore((s) => s.lang);
  const { openStories, loadStories, error, toast, upsertChat, send } = useStore.getState();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [viewers, setViewers] = useState<UserPublic[] | null>(null);
  const [reply, setReply] = useState('');
  const [report, setReport] = useState(false);
  const elapsed = useRef(0);

  const groupIndex = viewer ? groups.findIndex((g) => g.user.id === viewer.userId) : -1;
  const group = groupIndex >= 0 ? groups[groupIndex] : undefined;
  const story: Story | undefined = group?.stories[Math.min(index, (group?.stories.length ?? 1) - 1)];

  // Start each person's stories at the first one not seen yet.
  useEffect(() => {
    if (!group) return;
    const firstUnseen = group.stories.findIndex((s) => !s.viewed);
    setIndex(firstUnseen >= 0 ? firstUnseen : 0);
    setViewers(null);
  }, [viewer?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    openStories(null);
    void loadStories();
  };

  const go = (dir: 1 | -1) => {
    if (!group) return;
    setViewers(null);
    const next = index + dir;
    if (next >= 0 && next < group.stories.length) return setIndex(next);
    const other = groups[groupIndex + dir];
    if (other) openStories(other.user.id);
    else if (dir === 1) close();
  };

  // progress + auto-advance
  useEffect(() => {
    if (!story) return;
    elapsed.current = 0;
    setProgress(0);
    if (story.userId !== me?.id) void api.post(`/stories/${story.id}/view`).catch(() => undefined);
  }, [story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!story || paused || viewers || report) return;
    const timer = setInterval(() => {
      elapsed.current += 50;
      setProgress(Math.min(1, elapsed.current / DURATION));
      if (elapsed.current >= DURATION) go(1);
    }, 50);
    return () => clearInterval(timer);
  }, [story?.id, paused, viewers, report, index, groupIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!viewer || !me) return null;
  if (!group || !story) {
    // The story expired or was removed while the viewer was open.
    return null;
  }
  const own = story.userId === me.id;

  const showViewers = async () => {
    try {
      const r = await api.get<{ viewers: UserPublic[] }>(`/stories/${story.id}/viewers`);
      setViewers(r.viewers);
    } catch (e) {
      error(e);
    }
  };

  const remove = async () => {
    try {
      await api.del(`/stories/${story.id}`);
      await loadStories();
      if (group.stories.length <= 1) openStories(null);
    } catch (e) {
      error(e);
    }
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text) return;
    try {
      const r = await api.post<{ chat: Chat }>('/dm', { userId: story.userId });
      upsertChat(r.chat);
      const quoted = story.text ? `“${story.text.slice(0, 80)}”\n` : '';
      await send(r.chat.id, { text: `${t('story_reply_prefix')} ${quoted}${text}` });
      setReply('');
      toast(t('story_reply_sent'));
      close();
      navigate(`/chats/${r.chat.id}`);
    } catch (e) {
      error(e);
    }
  };

  const shareOut = async () => {
    setPaused(true);
    const payload = { title: group.user.name, text: story.text || t('story_share_text', { name: group.user.name }), url: window.location.origin };
    try {
      if (story.media) {
        const blob = await fetch(story.media.url).then((r) => r.blob());
        const file = new File([blob], story.media.name || 'story', { type: blob.type });
        if (canShareFiles(file) && (await nativeShare(payload, file))) return;
      }
      if (!(await nativeShare(payload))) useStore.getState().openShare({ ...payload, emoji: '✨', cta: t('share_cta_app') });
    } finally {
      setPaused(false);
    }
  };

  return (
    <div className="story-viewer">
      <div className="story-frame" style={{ background: story.media ? '#000' : safeBg(story.bg) }}>
        <div className="story-bars">
          {group.stories.map((s, i) => (
            <span key={s.id}>
              <i style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }} />
            </span>
          ))}
        </div>
        <header className="story-head">
          <Avatar id={group.user.id} name={group.user.name} src={group.user.avatar} size={38} />
          <div className="story-who">
            <strong>{own ? t('story_mine') : group.user.name}</strong>
            <span>{timeAgo(story.createdAt, lang)}</span>
          </div>
          <IconButton icon="share" label={t('share')} onClick={() => void shareOut()} />
          {own ? (
            <IconButton icon="trash" label={t('delete')} onClick={() => void remove()} />
          ) : (
            <IconButton icon="flag" label={t('report')} onClick={() => setReport(true)} />
          )}
          <IconButton icon="x" label={t('close')} onClick={close} />
        </header>

        {story.media?.kind === 'image' && <img className="story-media" src={story.media.url} alt="" />}
        {story.media?.kind === 'video' && <video className="story-media" src={story.media.url} autoPlay playsInline muted={false} />}
        {story.text && (
          <div className={`story-text ${story.media ? 'caption' : ''} ${story.text.length > 160 ? 'long' : ''}`} dir="auto">
            {story.text}
          </div>
        )}

        <button type="button" className="story-nav prev" onClick={() => go(-1)} aria-label={t('back')} />
        <button
          type="button"
          className="story-nav next"
          onClick={() => go(1)}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
          aria-label="next"
        />

        <footer className="story-foot">
          {own ? (
            <button type="button" className="story-views" onClick={() => void showViewers()}>
              <Icon name="eye" size={18} /> {t('story_views', { n: story.views })}
            </button>
          ) : (
            <form
              className="story-reply"
              onSubmit={(e) => {
                e.preventDefault();
                void sendReply();
              }}
            >
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
                placeholder={t('story_reply_ph', { name: group.user.name.split(' ')[0]! })}
                dir="auto"
              />
              <button type="submit" className="send-btn" disabled={!reply.trim()} aria-label={t('send')}>
                <Icon name="send" size={18} fill />
              </button>
            </form>
          )}
        </footer>
      </div>

      {viewers && (
        <Modal title={t('story_views', { n: viewers.length })} onClose={() => setViewers(null)}>
          {viewers.length === 0 && <p className="muted center">{t('story_no_views')}</p>}
          <div className="member-list">
            {viewers.map((u) => (
              <div key={u.id} className="member">
                <Avatar id={u.id} name={u.name} src={u.avatar} size={40} />
                <span className="member-text">
                  <strong>{u.name}</strong>
                  <small>@{u.username}</small>
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {report && <ReportDialog targetType="story" targetId={story.id} onClose={() => setReport(false)} />}
    </div>
  );
}
