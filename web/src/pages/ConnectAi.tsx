// The way back from signing in to one's AI account (OpenRouter).
//
//   /connect/openrouter?code=…       the person started from this very app or site: the
//                                    code is exchanged for their key, kept encrypted.
//   /connect/openrouter/app?code=…   they started from the phone app and signed in in the
//                                    phone's browser: this page hands the code back to the app.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UnlockDialog } from '../components/dialogs.tsx';
import { Logo } from '../components/icons.tsx';
import { Empty, Spinner } from '../components/ui.tsx';
import { OPENROUTER_DEFAULT_MODEL, exchangeCode, takeVerifier } from '../lib/ai/openrouter.ts';
import { useT } from '../lib/i18n.ts';
import { useStore } from '../lib/store.ts';

export default function ConnectAiPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useStore((s) => s.me);
  const e2e = useStore((s) => s.e2e);
  const code = new URLSearchParams(location.search).get('code') ?? '';
  const handoff = /\/app\/?$/.test(location.pathname);
  const appLink = `olimtalk://connect/openrouter?code=${encodeURIComponent(code)}`;
  const [state, setState] = useState<'working' | 'failed' | 'expired'>('working');
  const [unlock, setUnlock] = useState(false);
  const started = useRef(false);

  // On the phone: go back to the app, which holds the other half of the secret.
  useEffect(() => {
    if (handoff && code) window.location.href = appLink;
  }, [handoff, code, appLink]);

  useEffect(() => {
    if (handoff || !me || e2e !== 'ready' || started.current) return;
    started.current = true;
    const verifier = code ? takeVerifier() : null;
    if (!verifier) return setState('expired');
    const { saveVault, toast } = useStore.getState();
    exchangeCode(code, verifier)
      .then((key) => saveVault({ ai: { provider: 'openrouter', apiKey: key, model: OPENROUTER_DEFAULT_MODEL } }))
      .then(
        () => {
          toast(t('ai_account_connected'));
          navigate('/assistant', { replace: true });
        },
        () => setState('failed'),
      );
  }, [handoff, me, e2e, code]); // eslint-disable-line react-hooks/exhaustive-deps

  let body;
  if (handoff) {
    body = (
      <Empty emoji="✨" title={t('ai_connect_back_title')} text={t('ai_connect_back_text')}>
        <a className="btn primary" href={appLink}>
          {t('open_in_app')}
        </a>
      </Empty>
    );
  } else if (!me) {
    body = (
      <Empty emoji="🔑" title={t('ai_account_title')} text={t('ai_connect_login')}>
        <button type="button" className="btn primary" onClick={() => navigate('/welcome', { state: { mode: 'login', next: location.pathname + location.search } })}>
          {t('log_in')}
        </button>
      </Empty>
    );
  } else if (e2e !== 'ready') {
    // The key that is about to arrive is stored encrypted: the vault must be open.
    body = (
      <Empty emoji="🔒" title={t('e2e_locked_title')} text={t('e2e_unlock_text')}>
        <button type="button" className="btn primary" onClick={() => setUnlock(true)}>
          {t('e2e_unlock')}
        </button>
      </Empty>
    );
  } else if (state === 'working') {
    body = (
      <div className="center pad">
        <Spinner />
        <p className="muted">{t('ai_connecting')}</p>
      </div>
    );
  } else {
    body = (
      <Empty emoji="⚠️" title={t('ai_connect_failed')} text={t(state === 'expired' ? 'ai_connect_expired' : 'ai_connect_retry')}>
        <button type="button" className="btn primary" onClick={() => navigate('/assistant', { replace: true })}>
          {t('ai_mine')}
        </button>
      </Empty>
    );
  }

  return (
    <div className="join-page">
      <div className="auth-brand">
        <Logo size={44} />
        <span>OlimTalk</span>
      </div>
      <div className="join-card">{body}</div>
      {unlock && <UnlockDialog onClose={() => setUnlock(false)} />}
    </div>
  );
}
