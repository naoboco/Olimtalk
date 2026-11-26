// "Ma boîte mail": e-mails the person forwards to their private OlimTalk address,
// from Gmail, Outlook or any other provider. They are sealed with the person's key on
// arrival, and only decrypted here, on their device.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { unseal, unsealJson } from '../../../shared/e2e.ts';
import { AiResultDialog, useAi } from '../components/Ai.tsx';
import { UnlockDialog } from '../components/dialogs.tsx';
import { Icon } from '../components/icons.tsx';
import { ChatAvatar, Empty, IconButton, Modal, Spinner } from '../components/ui.tsx';
import { explainRequest, translateRequest } from '../lib/ai/index.ts';
import { api } from '../lib/api.ts';
import { myPrivateKey } from '../lib/e2ee.ts';
import { formatBytes, formatListTime, richText } from '../lib/format.tsx';
import { useT } from '../lib/i18n.ts';
import { IS_NATIVE, asset, openExternal } from '../lib/platform.ts';
import { copyText, downloadFile, nativeShare } from '../lib/share.ts';
import { useStore } from '../lib/store.ts';

interface Sender {
  name: string;
  address: string;
}
interface Header {
  from: Sender;
  subject: string;
  date: number;
  snippet: string;
  attachments: number;
}
interface Body {
  from: Sender;
  subject: string;
  date: number;
  text: string;
  attachments: { name: string; mime: string; size: number; data: string | null }[];
}
interface Row {
  id: number;
  receivedAt: number;
  size: number;
  read: boolean;
  body: string;
  /** null when this device cannot decrypt it. */
  header: Header | null;
}

export function MailSettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { toast, error } = useStore.getState();
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<{ address: string | null }>('/me/mailbox')
      .then((r) => setAddress(r.address))
      .catch(error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title={t('mail_mine')} onClose={onClose}>
      <div className="notice">
        <Icon name="shield" size={18} />
        <span>{t('mail_privacy')}</span>
      </div>
      <div className="section-title spaced">{t('mail_address')}</div>
      <div className="invite">
        <Icon name="at" size={18} />
        <span className="invite-url">{address ?? '…'}</span>
      </div>
      <div className="info-actions">
        <button type="button" className="btn small primary" disabled={!address} onClick={() => address && void copyText(address).then((ok) => ok && toast(t('copied')))}>
          <Icon name="copy" size={16} /> {t('copy')}
        </button>
        <button
          type="button"
          className="btn small ghost"
          onClick={() =>
            void api
              .post<{ address: string }>('/me/mailbox/reset')
              .then((r) => (setAddress(r.address), toast(t('mail_reset_done'))))
              .catch(error)
          }
        >
          <Icon name="refresh" size={16} /> {t('mail_reset')}
        </button>
      </div>
      <p className="muted small">{t('mail_how')}</p>
      <details className="howto" open>
        <summary>{t('mail_howto')}</summary>
        <ul>
          <li>{t('mail_howto_manual')}</li>
          <li>{t('mail_howto_gmail')}</li>
          <li>{t('mail_howto_outlook')}</li>
        </ul>
      </details>
    </Modal>
  );
}

export default function MailPage() {
  const t = useT();
  const navigate = useNavigate();
  const lang = useStore((s) => s.lang);
  const e2e = useStore((s) => s.e2e);
  const enabled = useStore((s) => s.config?.mail);
  const chats = useStore((s) => s.chats);
  const { error, toast, send } = useStore.getState();
  const ai = useAi();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<{ row: Row; body: Body | null } | null>(null);
  const [settings, setSettings] = useState(false);
  const [unlock, setUnlock] = useState(false);
  const [aiTask, setAiTask] = useState<'explain' | 'translate' | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = async () => {
    const key = myPrivateKey();
    try {
      const r = await api.get<{ emails: { id: number; receivedAt: number; size: number; read: boolean; body: string; header: string }[]; unread: number }>('/mail');
      useStore.setState({ mailUnread: r.unread });
      setRows(
        await Promise.all(
          r.emails.map(async (e) => ({ ...e, header: key ? await unsealJson<Header>(key, e.header).catch(() => null) : null })),
        ),
      );
    } catch (e) {
      error(e);
      setRows([]);
    }
  };

  useEffect(() => {
    if (enabled === false) return;
    void load();
  }, [e2e, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new e-mail arrived while the page is open.
  const unread = useStore((s) => s.mailUnread);
  useEffect(() => {
    if (rows && unread > rows.filter((r) => !r.read).length) void load();
  }, [unread]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = async (row: Row) => {
    setOpen({ row, body: null });
    const key = myPrivateKey();
    try {
      if (!key) throw new Error('locked');
      const sealed = new Uint8Array(await (await fetch(asset(row.body))).arrayBuffer());
      const body = JSON.parse(new TextDecoder().decode(await unseal(key, sealed))) as Body;
      setOpen({ row, body });
      if (!row.read) {
        await api.patch(`/mail/${row.id}`, { read: true });
        setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, read: true } : r)) ?? null);
        useStore.setState((s) => ({ mailUnread: Math.max(0, s.mailUnread - 1) }));
      }
    } catch {
      toast(t('e2e_message_failed'), 'error');
      setOpen(null);
    }
  };

  const remove = async (row: Row) => {
    try {
      await api.del(`/mail/${row.id}`);
      setRows((prev) => prev?.filter((r) => r.id !== row.id) ?? null);
      if (!row.read) useStore.setState((s) => ({ mailUnread: Math.max(0, s.mailUnread - 1) }));
      setOpen(null);
    } catch (e) {
      error(e);
    }
  };

  const saveFile = (a: Body['attachments'][number]) => {
    if (!a.data) return;
    const bytes = Uint8Array.from(atob(a.data), (c) => c.charCodeAt(0));
    const file = new File([bytes], a.name, { type: a.mime });
    if (IS_NATIVE) void nativeShare({ title: a.name, text: a.name, url: '' }, file);
    else downloadFile(file);
  };

  const body = open?.body;
  const asText = body ? `${body.subject}\n\n${body.text}` : '';
  const targets = Object.values(chats)
    .filter((c) => c.isMember && (c.type === 'dm' || c.sendPolicy === 'all' || c.role === 'owner' || c.role === 'admin'))
    .sort((a, b) => b.lastActivity - a.lastActivity);

  return (
    <div className="page">
      <header className="pane-head">
        <IconButton icon="back" label={t('back')} onClick={() => navigate(-1)} />
        <h1>{t('mail_mine')}</h1>
        <span className="grow" />
        <IconButton icon="refresh" label={t('retry')} onClick={() => void load()} />
        <IconButton icon="info" label={t('mail_address')} onClick={() => setSettings(true)} />
      </header>
      <div className="page-scroll">
        <div className="page-inner narrow">
          {enabled === false ? (
            <Empty emoji="📭" title={t('mail_disabled')} text={t('mail_disabled_text')} />
          ) : e2e !== 'ready' ? (
            <Empty emoji="🔒" title={t('e2e_locked_title')} text={t('e2e_unlock_text')}>
              <button type="button" className="btn primary" onClick={() => setUnlock(true)}>
                {t('e2e_unlock')}
              </button>
            </Empty>
          ) : !rows ? (
            <div className="center pad">
              <Spinner />
            </div>
          ) : rows.length === 0 ? (
            <Empty emoji="📬" title={t('mail_empty')} text={t('mail_empty_text')}>
              <button type="button" className="btn primary" onClick={() => setSettings(true)}>
                <Icon name="at" size={18} /> {t('mail_address')}
              </button>
            </Empty>
          ) : (
            <div className="card mail-list">
              {rows.map((row) => (
                <button key={row.id} type="button" className={`mail-row ${row.read ? '' : 'unread'}`} onClick={() => void read(row)}>
                  <span className="mail-dot" />
                  <span className="mail-main">
                    <span className="mail-top">
                      <strong dir="auto">{row.header ? row.header.from.name || row.header.from.address : `🔒 ${t('encrypted_message')}`}</strong>
                      <span className="chat-row-time">{formatListTime(row.header?.date ?? row.receivedAt, lang, t)}</span>
                    </span>
                    <span className="mail-subject" dir="auto">
                      {row.header?.subject || '—'}
                      {!!row.header?.attachments && ' 📎'}
                    </span>
                    <span className="chat-row-preview" dir="auto">
                      {row.header?.snippet}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {open && !aiTask && !sharing && (
        <Modal
          wide
          title={open.row.header?.subject || t('mail_mine')}
          onClose={() => setOpen(null)}
          footer={
            body && (
              <>
                <button type="button" className="btn ghost" onClick={() => void remove(open.row)}>
                  <Icon name="trash" size={18} /> <span className="hide-narrow">{t('delete')}</span>
                </button>
                <button type="button" className="btn soft" onClick={() => setSharing(true)}>
                  <Icon name="forward" size={18} /> <span className="hide-narrow">{t('mail_share')}</span>
                </button>
                <button
                  type="button"
                  className="btn soft"
                  onClick={() => void openExternal(`mailto:${body.from.address}?subject=${encodeURIComponent(`Re: ${body.subject}`)}`)}
                >
                  <Icon name="reply" size={18} /> <span className="hide-narrow">{t('reply')}</span>
                </button>
              </>
            )
          }
        >
          {!body ? (
            <div className="center pad">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="mail-from muted small">
                {body.from.name} &lt;{body.from.address}&gt; · {formatListTime(body.date, lang, t)}
              </div>
              {ai && (
                <div className="info-actions">
                  <button type="button" className="btn small primary" onClick={() => setAiTask('explain')}>
                    <Icon name="sparkles" size={16} /> {t('ai_explain')}
                  </button>
                  <button type="button" className="btn small soft" onClick={() => setAiTask('translate')}>
                    <Icon name="globe" size={16} /> {t('ai_translate')}
                  </button>
                </div>
              )}
              <div className="mail-body" dir="auto">
                {richText(body.text || '—')}
              </div>
              {body.attachments.map((a, i) => (
                <button key={i} type="button" className="file" disabled={!a.data} onClick={() => saveFile(a)}>
                  <span className="file-icon">
                    <Icon name="file" size={22} />
                  </span>
                  <span className="file-meta">
                    <span className="file-name">{a.name}</span>
                    <span className="file-size">{a.data ? formatBytes(a.size) : t('mail_attachment_too_large')}</span>
                  </span>
                  {a.data && <Icon name="download" size={18} />}
                </button>
              ))}
            </>
          )}
        </Modal>
      )}

      {open && body && aiTask && (
        <AiResultDialog
          title={aiTask === 'explain' ? t('ai_explain') : t('ai_translate')}
          request={aiTask === 'explain' ? explainRequest(asText, lang) : translateRequest(asText, lang)}
          source={body.subject}
          onClose={() => setAiTask(null)}
        />
      )}

      {open && body && sharing && (
        <Modal title={t('mail_share')} onClose={() => setSharing(false)}>
          <p className="muted small">{t('mail_share_text')}</p>
          <div className="pick-list">
            {targets.map((c) => (
              <button
                key={c.id}
                type="button"
                className="pick"
                onClick={() => {
                  void send(c.id, { text: `📧 ${body.subject}\n\n${body.text.slice(0, 3500)}` });
                  setSharing(false);
                  setOpen(null);
                  navigate(`/chats/${c.id}`);
                }}
              >
                <ChatAvatar chat={c} size={40} />
                <span className="pick-name">{c.name}</span>
                {c.type === 'dm' ? <Icon name="shield" size={16} /> : <Icon name="globe" size={16} />}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {settings && <MailSettingsDialog onClose={() => setSettings(false)} />}
      {unlock && <UnlockDialog onClose={() => setUnlock(false)} />}
    </div>
  );
}
