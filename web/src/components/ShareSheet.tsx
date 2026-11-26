import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n.ts';
import {
  canNativeShare,
  copyText,
  downloadFile,
  emailUrl,
  facebookUrl,
  makeShareCard,
  nativeShare,
  qrDataUrl,
  telegramUrl,
  whatsappUrl,
  xUrl,
} from '../lib/share.ts';
import { IS_NATIVE, openExternal } from '../lib/platform.ts';
import { useStore } from '../lib/store.ts';
import { Icon } from './icons.tsx';
import { Modal, Spinner } from './ui.tsx';

/**
 * Share a group, community, event or message outside OlimTalk.
 * WhatsApp / Facebook / Telegram / X accept a link; Instagram does not, so for
 * Instagram we generate a story-format image (with a QR code) and hand it to the
 * phone's share sheet — or download it on desktop.
 */
export function ShareSheet() {
  const t = useT();
  const p = useStore((s) => s.share);
  const { openShare, toast } = useStore.getState();
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setQr(null);
    if (!p) return;
    let cancelled = false;
    qrDataUrl(p.url, 360)
      .then((d) => !cancelled && setQr(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [p]);

  if (!p) return null;
  const close = () => openShare(null);
  const open = (url: string) => void openExternal(url);

  const copy = async () => {
    if (await copyText(p.url)) toast(t('link_copied'));
  };

  const instagram = async () => {
    setBusy(true);
    try {
      const card = await makeShareCard(p);
      // On phones the system sheet offers Instagram (story, post or message).
      if (await nativeShare(p, card)) return;
      downloadFile(card);
      await copyText(p.url);
      toast(t('share_instagram_done'));
    } catch {
      toast(t('err_server_error'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveCard = async () => {
    setBusy(true);
    try {
      const card = await makeShareCard(p);
      // A phone app has no "downloads": hand the image to the share sheet (save, send, post…).
      if (IS_NATIVE) await nativeShare(p, card);
      else downloadFile(card);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('share')} onClose={close}>
      <div className="share-head">
        <span className="share-emoji">{p.emoji || '💬'}</span>
        <div>
          <strong dir="auto">{p.title}</strong>
          <span className="muted small">{p.url.replace(/^https?:\/\//, '')}</span>
        </div>
      </div>

      <div className="share-grid">
        <button type="button" className="share-target" onClick={() => open(whatsappUrl(p))}>
          <span className="share-icon" style={{ background: '#25D366' }}>
            <Icon name="chat" size={24} />
          </span>
          WhatsApp
        </button>
        <button type="button" className="share-target" onClick={() => void instagram()} disabled={busy}>
          <span className="share-icon" style={{ background: 'linear-gradient(45deg,#F58529,#DD2A7B 50%,#8134AF 80%,#515BD4)' }}>
            {busy ? <Spinner size={20} /> : <Icon name="camera" size={24} />}
          </span>
          Instagram
        </button>
        <button type="button" className="share-target" onClick={() => open(facebookUrl(p))}>
          <span className="share-icon" style={{ background: '#1877F2' }}>
            <b>f</b>
          </span>
          Facebook
        </button>
        <button type="button" className="share-target" onClick={() => open(telegramUrl(p))}>
          <span className="share-icon" style={{ background: '#229ED9' }}>
            <Icon name="send" size={22} />
          </span>
          Telegram
        </button>
        <button type="button" className="share-target" onClick={() => open(xUrl(p))}>
          <span className="share-icon" style={{ background: '#111' }}>
            <b>X</b>
          </span>
          X
        </button>
        <button type="button" className="share-target" onClick={() => (IS_NATIVE ? open(emailUrl(p)) : (window.location.href = emailUrl(p)))}>
          <span className="share-icon" style={{ background: '#6B7280' }}>
            <Icon name="at" size={22} />
          </span>
          E-mail
        </button>
        <button type="button" className="share-target" onClick={() => void copy()}>
          <span className="share-icon" style={{ background: 'var(--primary)' }}>
            <Icon name="link" size={22} />
          </span>
          {t('copy_link')}
        </button>
        {canNativeShare() && (
          <button type="button" className="share-target" onClick={() => void nativeShare(p)}>
            <span className="share-icon" style={{ background: '#12A594' }}>
              <Icon name="share" size={22} />
            </span>
            {t('share_more')}
          </button>
        )}
      </div>

      <div className="share-qr">
        {qr ? <img src={qr} alt="QR" width={150} height={150} /> : <Spinner />}
        <div>
          <strong>{t('share_qr_title')}</strong>
          <p className="muted small">{t('share_qr_text')}</p>
          <button type="button" className="btn small soft" onClick={() => void saveCard()} disabled={busy}>
            <Icon name={IS_NATIVE ? 'share' : 'download'} size={16} /> {IS_NATIVE ? t('share_card') : t('share_download_card')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
