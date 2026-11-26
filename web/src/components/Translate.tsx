// Automatic translation: the settings, and the question asked before a private message
// is shown to a translation service.
import { useNavigate } from 'react-router-dom';
import type { Lang, Me } from '../../../shared/types.ts';
import { PROVIDERS } from '../lib/ai/index.ts';
import { api } from '../lib/api.ts';
import { useT } from '../lib/i18n.ts';
import { useStore } from '../lib/store.ts';
import { translateNow, type Translatable } from '../lib/translate.ts';
import { useAi } from './Ai.tsx';
import { Icon } from './icons.tsx';
import { Modal } from './ui.tsx';

/** Each language under the name its speakers give it. */
const NATIVE: Record<string, string> = { fr: 'Français', en: 'English', es: 'Español', ru: 'Русский', he: 'עברית' };

async function savePrefs(patch: Partial<Pick<Me, 'autoTranslate' | 'translatePrivate' | 'readLangs'>>) {
  const { me, setMe, error } = useStore.getState();
  if (!me) return;
  setMe({ ...me, ...patch }); // the switch answers at once…
  try {
    setMe((await api.patch<{ me: Me }>('/me', patch)).me);
  } catch (e) {
    setMe(me); // …and goes back if the server said no
    error(e);
  }
}

export function TranslationSettings() {
  const t = useT();
  const navigate = useNavigate();
  const me = useStore((s) => s.me)!;
  const server = useStore((s) => !!s.config?.translate);
  const ai = useAi();
  const lang = me.world as Lang;
  const provider = ai ? (ai.provider === 'custom' ? t('ai_provider_custom') : PROVIDERS[ai.provider].label) : '';

  if (!server && !ai) {
    return (
      <div className="card">
        <div className="section-title">{t('tr_title')}</div>
        <p className="muted small">{t('tr_unavailable')}</p>
        <button type="button" className="btn soft" onClick={() => navigate('/assistant')}>
          <Icon name="sparkles" size={18} /> {t('ai_connect')}
        </button>
      </div>
    );
  }

  // Translating with the server costs the reader nothing: on unless switched off. With
  // their own AI it uses their credit: off until switched on.
  const auto = me.autoTranslate ?? server;
  const toggleRead = (code: string) => void savePrefs({ readLangs: me.readLangs.includes(code) ? me.readLangs.filter((l) => l !== code) : [...me.readLangs, code] });

  return (
    <div className="card list-card">
      <div className="section-title pad">{t('tr_title')}</div>
      <label className="switch-row pad">
        <span>
          <Icon name="globe" size={18} /> {t('tr_auto')}
          <small>
            {t('tr_auto_hint')}
            {!server && ` ${t('tr_with_ai_hint', { provider })}`}
          </small>
        </span>
        <input type="checkbox" className="switch" checked={auto} onChange={(e) => void savePrefs({ autoTranslate: e.target.checked })} />
      </label>
      <div className="tr-reads">
        <span className="field-label">{t('tr_reads')}</span>
        <div className="chips wrap">
          {Object.keys(NATIVE)
            .filter((code) => code !== lang)
            .map((code) => (
              <button key={code} type="button" className={`chip ${me.readLangs.includes(code) ? 'active' : ''}`} aria-pressed={me.readLangs.includes(code)} onClick={() => toggleRead(code)}>
                {NATIVE[code]}
              </button>
            ))}
        </div>
        <small className="muted">{t('tr_reads_hint')}</small>
      </div>
      <label className="switch-row pad">
        <span>
          <Icon name="shield" size={18} /> {t('tr_private')}
          <small>{ai ? t('tr_private_hint_ai', { provider }) : t('tr_private_hint_server')}</small>
        </span>
        <input type="checkbox" className="switch" checked={me.translatePrivate} disabled={!auto} onChange={(e) => void savePrefs({ translatePrivate: e.target.checked })} />
      </label>
    </div>
  );
}

/** Asked the first time someone wants a private message translated and has no AI of their own. */
export function PrivateTranslationDialog({ message, onClose }: { message: Translatable; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const { toast } = useStore.getState();
  const enable = async () => {
    await savePrefs({ translatePrivate: true });
    onClose();
    if (!useStore.getState().me?.translatePrivate) return;
    if ((await translateNow(message)) === 'failed') toast(t('tr_failed'), 'error');
  };
  return (
    <Modal
      title={t('tr_private_ask_title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn primary" onClick={() => void enable()}>
            {t('tr_private_enable')}
          </button>
        </>
      }
    >
      <div className="notice">
        <Icon name="shield" size={18} />
        <span>{t('tr_private_ask_text')}</span>
      </div>
      <p className="muted small spaced">{t('tr_private_ask_alt')}</p>
      <button type="button" className="btn soft block" onClick={() => (onClose(), navigate('/assistant'))}>
        <Icon name="sparkles" size={18} /> {t('ai_connect')}
      </button>
    </Modal>
  );
}
