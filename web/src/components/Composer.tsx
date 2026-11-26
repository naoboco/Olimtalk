import { useEffect, useRef, useState } from 'react';
import type { Attachment, Chat, Member, Message } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';
import { formatDuration } from '../lib/format.tsx';
import { useT } from '../lib/i18n.ts';
import { uploadFile, uploadVoice, useRecorder } from '../lib/media.ts';
import { getSocket, useStore } from '../lib/store.ts';
import { Icon } from './icons.tsx';
import { previewLine } from './Message.tsx';
import { Avatar, EmojiPicker, IconButton, Menu, Spinner, useMenu } from './ui.tsx';

const drafts = new Map<number, string>();
const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function Composer({
  chat,
  replyTo,
  editing,
  onClearReply,
  onClearEdit,
  onPoll,
  onEvent,
}: {
  chat: Chat;
  replyTo: Message | null;
  editing: Message | null;
  onClearReply: () => void;
  onClearEdit: () => void;
  onPoll: () => void;
  onEvent: () => void;
}) {
  const t = useT();
  const send = useStore((s) => s.send);
  const error = useStore((s) => s.error);
  const toast = useStore((s) => s.toast);
  const [text, setText] = useState(() => drafts.get(chat.id) ?? '');
  const [pending, setPending] = useState<{ file: File; preview: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mention, setMention] = useState<{ q: string; start: number; items: Member[] } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const attachMenu = useMenu();

  // Editing a message loads its text into the field.
  useEffect(() => {
    if (editing) {
      setText(editing.text);
      area.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (!editing) drafts.set(chat.id, text);
  }, [text, chat.id, editing]);

  // Auto-grow the textarea.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => () => void (pending?.preview && URL.revokeObjectURL(pending.preview)), [pending]);

  const recorder = useRecorder(
    async (blob, seconds) => {
      setUploading(true);
      try {
        const attachment = await uploadVoice(blob, seconds);
        await send(chat.id, { attachment, replyTo });
        onClearReply();
      } catch (e) {
        error(e);
      } finally {
        setUploading(false);
      }
    },
    () => toast(t('err_microphone'), 'error'),
  );

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return toast(t('err_file_too_large'), 'error');
    setPending({ file, preview: file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : null });
    area.current?.focus();
  };

  const submit = async () => {
    const value = text.trim();
    if (uploading) return;
    if (editing) {
      if (!value && !editing.attachment) return;
      try {
        if (value !== editing.text) await api.patch(`/messages/${editing.id}`, { text: value });
        setText(drafts.get(chat.id) ?? '');
        onClearEdit();
      } catch (e) {
        error(e);
      }
      return;
    }
    if (!value && !pending) return;
    let attachment: Attachment | null = null;
    if (pending) {
      setUploading(true);
      try {
        attachment = await uploadFile(pending.file);
      } catch (e) {
        setUploading(false);
        error(e);
        return;
      }
      setUploading(false);
      setPending(null);
    }
    setText('');
    drafts.delete(chat.id);
    setMention(null);
    setEmojiOpen(false);
    onClearReply();
    void send(chat.id, { text: value, attachment, replyTo });
    area.current?.focus();
  };

  // @mention autocomplete
  const updateMention = (value: string, caret: number) => {
    if (chat.type !== 'group') return setMention(null);
    const before = value.slice(0, caret);
    const m = /(?:^|\s)@([a-zA-Z0-9_.]{0,30})$/.exec(before);
    if (!m) return setMention(null);
    const q = m[1]!;
    const start = caret - q.length - 1;
    setMention((prev) => ({ q, start, items: prev?.items ?? [] }));
  };

  useEffect(() => {
    if (!mention) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<{ members: Member[] }>(`/chats/${chat.id}/members?q=${encodeURIComponent(mention.q)}`)
        .then((r) => !cancelled && setMention((cur) => (cur && cur.q === mention.q ? { ...cur, items: r.members.slice(0, 6) } : cur)))
        .catch(() => undefined);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mention?.q, chat.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyMention = (username: string) => {
    if (!mention) return;
    const caret = area.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, mention.start)}@${username} ${text.slice(caret)}`;
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + username.length + 2;
      area.current?.focus();
      area.current?.setSelectionRange(pos, pos);
    });
  };

  const insertEmoji = (emoji: string) => {
    const el = area.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    updateMention(e.target.value, e.target.selectionStart);
    const now = Date.now();
    if (e.target.value && now - lastTyping.current > 2500) {
      lastTyping.current = now;
      getSocket()?.emit('typing', chat.id);
    }
  };

  const bar = editing ?? replyTo;
  const canSend = !!text.trim() || !!pending;

  if (recorder.recording) {
    return (
      <div className="composer recording">
        <IconButton icon="trash" label={t('cancel')} onClick={() => recorder.stop(true)} className="danger" />
        <span className="rec-dot" />
        <span className="rec-time">{formatDuration(recorder.seconds)}</span>
        <span className="rec-hint">{t('recording')}</span>
        <button type="button" className="send-btn" onClick={() => recorder.stop(false)} aria-label={t('send')}>
          <Icon name="send" size={20} fill />
        </button>
      </div>
    );
  }

  return (
    <div
      className="composer-wrap"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        pickFile(e.dataTransfer.files[0]);
      }}
    >
      {mention && mention.items.length > 0 && (
        <div className="mention-list">
          {mention.items.map((m) => (
            <button key={m.user.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMention(m.user.username)}>
              <Avatar id={m.user.id} name={m.user.name} src={m.user.avatar} size={28} />
              <span className="mention-name">{m.user.name}</span>
              <span className="mention-user">@{m.user.username}</span>
            </button>
          ))}
        </div>
      )}
      {emojiOpen && (
        <div className="emoji-pop">
          <EmojiPicker onPick={insertEmoji} />
        </div>
      )}
      {bar && (
        <div className="composer-bar">
          <Icon name={editing ? 'edit' : 'reply'} size={18} />
          <div className="composer-bar-text">
            <strong>{editing ? t('editing_message') : t('replying_to', { name: bar.user.name })}</strong>
            <span dir="auto">{previewLine({ type: bar.type, text: bar.poll?.question ?? (bar.text || bar.attachment?.name || ''), deleted: false }, t)}</span>
          </div>
          <IconButton
            icon="x"
            label={t('cancel')}
            size={18}
            onClick={() => {
              if (editing) {
                setText(drafts.get(chat.id) ?? '');
                onClearEdit();
              } else onClearReply();
            }}
          />
        </div>
      )}
      {pending && (
        <div className="composer-bar attach">
          {pending.preview ? (
            pending.file.type.startsWith('video/') ? (
              <video src={pending.preview} muted />
            ) : (
              <img src={pending.preview} alt="" />
            )
          ) : (
            <span className="file-icon">
              <Icon name="file" size={20} />
            </span>
          )}
          <div className="composer-bar-text">
            <strong>{pending.file.name}</strong>
            <span>{t('add_caption')}</span>
          </div>
          {uploading ? <Spinner size={18} /> : <IconButton icon="x" label={t('cancel')} size={18} onClick={() => setPending(null)} />}
        </div>
      )}
      <div className="composer">
        <IconButton icon="smile" label={t('emoji')} onClick={() => setEmojiOpen((v) => !v)} active={emojiOpen} />
        {!editing && <IconButton icon="clip" label={t('attach')} onClick={attachMenu.openFrom} />}
        <textarea
          ref={area}
          rows={1}
          dir="auto"
          value={text}
          placeholder={t('type_message')}
          aria-label={t('type_message')}
          onChange={onChange}
          onPaste={(e) => {
            const file = [...e.clipboardData.files][0];
            if (file) {
              e.preventDefault();
              pickFile(file);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !isTouch() && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (mention && mention.items[0]) applyMention(mention.items[0].user.username);
              else void submit();
            }
            if (e.key === 'Escape') {
              if (mention) setMention(null);
              else if (editing) {
                setText(drafts.get(chat.id) ?? '');
                onClearEdit();
              } else if (replyTo) onClearReply();
            }
          }}
        />
        {canSend || editing ? (
          <button type="button" className="send-btn" onClick={() => void submit()} disabled={uploading || (!canSend && !editing)} aria-label={editing ? t('save') : t('send')}>
            {uploading ? <Spinner size={18} /> : <Icon name={editing ? 'check' : 'send'} size={20} fill={!editing} />}
          </button>
        ) : (
          <button type="button" className="send-btn mic" onClick={() => void recorder.start()} disabled={uploading} aria-label={t('voice_message')} title={t('voice_message')}>
            {uploading ? <Spinner size={18} /> : <Icon name="mic" size={21} />}
          </button>
        )}
      </div>
      <input ref={mediaInput} type="file" accept="image/*,video/*" hidden onChange={(e) => (pickFile(e.target.files?.[0]), (e.target.value = ''))} />
      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,audio/*"
        hidden
        onChange={(e) => (pickFile(e.target.files?.[0]), (e.target.value = ''))}
      />
      {attachMenu.at && (
        <Menu
          x={attachMenu.at.x + 180}
          y={attachMenu.at.y - 240}
          onClose={attachMenu.close}
          items={[
            { icon: 'image', label: t('attach_media'), onClick: () => mediaInput.current?.click() },
            { icon: 'file', label: t('attach_file'), onClick: () => fileInput.current?.click() },
            { icon: 'poll', label: t('attach_poll'), onClick: onPoll },
            { icon: 'calendar', label: t('attach_event'), onClick: onEvent, hidden: chat.type !== 'group' },
          ]}
        />
      )}
    </div>
  );
}
