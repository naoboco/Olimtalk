// "Mon IA": the person plugs in the assistant of their choice with their own key.
import { useEffect, useRef, useState } from 'react';
import { AiError, PROVIDERS, complete, isConfigured, listModels, type AiModel, type AiRequest, type AiSettings } from '../lib/ai/index.ts';
import { sendToAiApp } from '../lib/ai/relay-app.ts';
import { AI_APPS, AI_APP_ORDER, relayRequest, type AiAppId } from '../lib/ai/relay.ts';
import { richText } from '../lib/format.tsx';
import { useT, type Key, type T } from '../lib/i18n.ts';
import { IS_NATIVE } from '../lib/platform.ts';
import { copyText } from '../lib/share.ts';
import { useStore } from '../lib/store.ts';
import { UnlockDialog } from './dialogs.tsx';
import { Icon } from './icons.tsx';
import { Field, Modal, Spinner } from './ui.tsx';

export function aiErrorText(error: unknown, t: T): string {
  const code = error instanceof AiError ? error.code : 'network';
  const key = `ai_err_${code}` as Key;
  const text = t(key);
  const detail = error instanceof AiError && error.message !== error.code && code !== 'refused' ? ` (${error.message.slice(0, 140)})` : '';
  return (text === key ? t('ai_error') : text) + detail;
}

/** The AI the person connected, or null. */
export function useAi(): AiSettings | null {
  const ai = useStore((s) => s.ai);
  return isConfigured(ai ?? undefined) ? ai : null;
}

/** Relay mode: the AI application the person chose to use, without any key. */
export function useAiApp(): AiAppId | null {
  return useStore((s) => s.aiApp);
}

export const aiAppName = (app: AiAppId, t: T) => (app === 'other' ? t('ai_app_other') : AI_APPS[app].label);

/**
 * Relay mode: write the request, copy it and open the person's own AI application.
 * `template` is one of the "relay_…" texts, in which {text} is replaced.
 */
export async function relayToAiApp(app: AiAppId, template: Key, text: string, t: T) {
  const result = await sendToAiApp(app, relayRequest(t(template), text));
  if (result === 'shared') return;
  useStore.getState().toast(result === 'opened' ? t('ai_relay_copied', { app: aiAppName(app, t) }) : t('ai_relay_copied_other'));
}

const PROVIDER_ORDER: AiSettings['provider'][] = ['anthropic', 'openai', 'gemini', 'mistral', 'custom'];

export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const saved = useStore((s) => s.ai);
  const e2e = useStore((s) => s.e2e);
  const aiApp = useAiApp();
  const { saveVault, toast, error, setAiApp } = useStore.getState();
  const chooseApp = (app: AiAppId) => {
    const next = aiApp === app ? null : app;
    setAiApp(next);
    if (next) toast(t('ai_app_saved', { app: aiAppName(next, t) }));
  };
  const [provider, setProvider] = useState<AiSettings['provider']>(saved?.provider ?? 'anthropic');
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? '');
  const [model, setModel] = useState(saved?.model ?? PROVIDERS[saved?.provider ?? 'anthropic'].defaultModel);
  const [models, setModels] = useState<AiModel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [unlock, setUnlock] = useState(false);
  const info = PROVIDERS[provider];
  const draft: AiSettings = { provider, apiKey: apiKey.trim(), model: model.trim(), baseUrl: baseUrl.trim() || undefined };

  const pick = (next: AiSettings['provider']) => {
    setProvider(next);
    setModels(null);
    setProblem(null);
    setModel(next === saved?.provider ? saved.model : PROVIDERS[next].defaultModel);
  };

  // Listing the models is also how the key is checked.
  const check = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const list = await listModels(draft);
      setModels(list);
      if (!list.some((m) => m.id === draft.model)) setModel(list.find((m) => m.id === info.defaultModel)?.id ?? list[0]?.id ?? '');
      toast(t('ai_key_ok', { n: list.length }));
    } catch (e) {
      setModels(null);
      setProblem(aiErrorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const save = async (settings: AiSettings | undefined) => {
    setBusy(true);
    try {
      await saveVault({ ai: settings && { ...settings, maxOutput: models?.find((m) => m.id === settings.model)?.maxOutput ?? (settings.model === saved?.model ? saved?.maxOutput : undefined) } });
      toast(settings ? t('ai_saved') : t('ai_removed'));
      onClose();
    } catch (e) {
      error(e);
      setBusy(false);
    }
  };

  if (unlock) return <UnlockDialog onClose={() => setUnlock(false)} />;

  return (
    <Modal
      title={t('ai_mine')}
      onClose={onClose}
      footer={
        <>
          {saved && (
            <button type="button" className="btn ghost" onClick={() => void save(undefined)} disabled={busy}>
              {t('ai_disconnect')}
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('close')}
          </button>
          <button type="button" className="btn primary" onClick={() => void save(draft)} disabled={busy || e2e !== 'ready' || !isConfigured(draft)}>
            {t('save')}
          </button>
        </>
      }
    >
      <div className="section-title">{t('ai_app_title')}</div>
      <p className="muted small">{t('ai_app_text')}</p>
      <div className="chips wrap ai-apps">
        {AI_APP_ORDER.map((app) => (
          <button key={app} type="button" className={`chip ${aiApp === app ? 'active' : ''}`} aria-pressed={aiApp === app} onClick={() => chooseApp(app)}>
            {aiAppName(app, t)}
          </button>
        ))}
      </div>

      <div className="section-title spaced">{t('ai_api_title')}</div>
      <p className="muted small">{t('ai_api_text')}</p>
      <div className="notice">
        <Icon name="shield" size={18} />
        <span>{t('ai_privacy')}</span>
      </div>
      {e2e !== 'ready' && (
        <button type="button" className="banner error as-button" onClick={() => setUnlock(true)}>
          {t('e2e_locked_banner')}
        </button>
      )}
      <div className="field">
        <span className="field-label">{t('ai_provider')}</span>
        <div className="chips wrap">
          {PROVIDER_ORDER.map((p) => (
            <button key={p} type="button" className={`chip ${p === provider ? 'active' : ''}`} onClick={() => pick(p)}>
              {p === 'custom' ? t('ai_provider_custom') : PROVIDERS[p].label}
            </button>
          ))}
        </div>
      </div>
      {info.needsBaseUrl && (
        <Field label={t('ai_base_url')} hint={IS_NATIVE ? t('ai_base_url_hint') : t('ai_base_url_hint_web')}>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" autoCapitalize="none" spellCheck={false} />
        </Field>
      )}
      <Field label={t('ai_key')} hint={info.site ? t('ai_key_hint', { site: info.site.replace('https://', '') }) : t('ai_key_optional')}>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} />
      </Field>
      <button type="button" className="btn soft block" onClick={() => void check()} disabled={busy || (!draft.apiKey && !info.needsBaseUrl) || (info.needsBaseUrl && !draft.baseUrl)}>
        {busy ? <Spinner size={16} /> : <Icon name="check" size={18} />} {t('ai_check')}
      </button>
      {problem && <div className="banner error spaced">{problem}</div>}
      <Field label={t('ai_model')} hint={t('ai_model_hint')}>
        {models && models.length > 0 ? (
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name === m.id ? m.id : `${m.name} — ${m.id}`}
              </option>
            ))}
          </select>
        ) : (
          <input value={model} onChange={(e) => setModel(e.target.value)} autoCapitalize="none" spellCheck={false} />
        )}
      </Field>
    </Modal>
  );
}

/** Run one request with the person's AI and show the answer as it arrives. */
export function AiResultDialog({ title, request, source, onClose }: { title: string; request: AiRequest; source?: string; onClose: () => void }) {
  const t = useT();
  const ai = useAi();
  const toast = useStore((s) => s.toast);
  const [text, setText] = useState('');
  const [state, setState] = useState<'running' | 'done' | 'error'>('running');
  const [problem, setProblem] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (!ai || started.current) return;
    started.current = true;
    const abort = new AbortController();
    complete(ai, { ...request, signal: abort.signal, onText: (delta) => setText((prev) => prev + delta) }).then(
      (full) => {
        setText(full);
        setState('done');
      },
      (e) => {
        if (abort.signal.aborted) return;
        setProblem(aiErrorText(e, t));
        setState('error');
      },
    );
    return () => abort.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        state === 'done' ? (
          <button type="button" className="btn soft" onClick={() => void copyText(text).then((ok) => ok && toast(t('copied')))}>
            <Icon name="copy" size={18} /> {t('copy')}
          </button>
        ) : undefined
      }
    >
      {source && (
        <blockquote className="ai-source" dir="auto">
          {source.length > 400 ? `${source.slice(0, 400)}…` : source}
        </blockquote>
      )}
      {!ai && <p className="muted">{t('ai_not_connected')}</p>}
      {state === 'error' && <div className="banner error">{problem}</div>}
      <div className="ai-answer" dir="auto">
        {richText(text)}
        {state === 'running' && ai && <span className="ai-cursor" />}
      </div>
      {ai && <p className="muted small ai-via">{t('ai_via', { provider: ai.provider === 'custom' ? t('ai_provider_custom') : PROVIDERS[ai.provider].label })}</p>}
    </Modal>
  );
}
