import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AiSettingsDialog, aiAppName, aiErrorText, relayToAiApp, useAi, useAiApp } from '../components/Ai.tsx';
import { Icon } from '../components/icons.tsx';
import { Empty, IconButton, Spinner } from '../components/ui.tsx';
import { PROVIDERS, assistantSystem, complete, type ChatTurn } from '../lib/ai/index.ts';
import { richText } from '../lib/format.tsx';
import { useT } from '../lib/i18n.ts';
import { useStore } from '../lib/store.ts';

// The conversation with one's own AI stays in the memory of the device: it is not
// stored by OlimTalk and disappears when the app is closed.
let memory: ChatTurn[] = [];

export default function AssistantPage() {
  const t = useT();
  const navigate = useNavigate();
  const ai = useAi();
  const aiApp = useAiApp();
  const lang = useStore((s) => s.lang);
  const [turns, setTurns] = useState<ChatTurn[]>(memory);
  const [draft, setDraft] = useState('');
  const [answer, setAnswer] = useState<string | null>(null); // the reply being written
  const [problem, setProblem] = useState('');
  const [settings, setSettings] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    memory = turns;
  }, [turns]);
  useEffect(() => {
    // Braces matter: recent browsers return a promise from scrollIntoView(), and an
    // effect must return nothing or a clean-up function.
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [turns, answer]);
  useEffect(() => () => abort.current?.abort(), []);

  const ask = async (question: string) => {
    if (!question.trim()) return;
    if (!ai) {
      // Relay mode: the question opens in the person's own AI application.
      if (aiApp) {
        setDraft('');
        await relayToAiApp(aiApp, 'relay_ask', question, t);
      }
      return;
    }
    if (answer !== null) return;
    const next: ChatTurn[] = [...turns, { role: 'user', content: question.trim() }];
    setTurns(next);
    setDraft('');
    setProblem('');
    setAnswer('');
    abort.current = new AbortController();
    try {
      const full = await complete(ai, {
        system: assistantSystem(lang),
        messages: next,
        signal: abort.current.signal,
        onText: (delta) => setAnswer((prev) => (prev ?? '') + delta),
      });
      setTurns([...next, { role: 'assistant', content: full }]);
    } catch (e) {
      if (!abort.current.signal.aborted) setProblem(aiErrorText(e, t));
    } finally {
      setAnswer(null);
    }
  };

  const suggestions = [t('ai_suggest_1'), t('ai_suggest_2'), t('ai_suggest_3')];

  return (
    <div className="page">
      <header className="pane-head">
        <IconButton icon="back" label={t('back')} onClick={() => navigate(-1)} />
        <h1>{t('ai_assistant')}</h1>
        <span className="grow" />
        {turns.length > 0 && <IconButton icon="refresh" label={t('ai_new_chat')} onClick={() => (abort.current?.abort(), setTurns([]), setProblem(''))} />}
        <IconButton icon="edit" label={t('ai_mine')} onClick={() => setSettings(true)} />
      </header>
      {!ai && aiApp ? (
        <>
          <div className="page-scroll">
            <div className="page-inner narrow assistant">
              <div className="assistant-intro">
                <span className="hero-emoji">✨</span>
                <h2>{t('ai_hello')}</h2>
                <p className="muted">{t('ai_app_assistant', { app: aiAppName(aiApp, t) })}</p>
                <div className="assistant-suggestions">
                  {suggestions.map((s) => (
                    <button key={s} type="button" className="chip" onClick={() => void ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <form
            className="composer assistant-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft);
            }}
          >
            <textarea rows={1} dir="auto" value={draft} placeholder={t('ai_ask')} aria-label={t('ai_ask')} onChange={(e) => setDraft(e.target.value)} />
            <button type="submit" className="send-btn" disabled={!draft.trim()} aria-label={t('ai_open_app', { app: aiAppName(aiApp, t) })}>
              <Icon name="external" size={20} />
            </button>
          </form>
        </>
      ) : !ai ? (
        <Empty emoji="✨" title={t('ai_connect_title')} text={t('ai_connect_text')}>
          <button type="button" className="btn primary" onClick={() => setSettings(true)}>
            <Icon name="sparkles" size={18} /> {t('ai_connect')}
          </button>
        </Empty>
      ) : (
        <>
          <div className="page-scroll">
            <div className="page-inner narrow assistant">
              {turns.length === 0 && answer === null && (
                <div className="assistant-intro">
                  <span className="hero-emoji">✨</span>
                  <h2>{t('ai_hello')}</h2>
                  <p className="muted">{t('ai_via', { provider: ai.provider === 'custom' ? t('ai_provider_custom') : PROVIDERS[ai.provider].label })}</p>
                  <div className="assistant-suggestions">
                    {suggestions.map((s) => (
                      <button key={s} type="button" className="chip" onClick={() => void ask(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {turns.map((turn, i) => (
                <div key={i} className={`row ${turn.role === 'user' ? 'mine' : 'theirs'} tail`}>
                  <div className="bubble-wrap">
                    <div className="bubble no-meta">
                      <div className="text" dir="auto">
                        {richText(turn.content)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {answer !== null && (
                <div className="row theirs tail">
                  <div className="bubble-wrap">
                    <div className="bubble no-meta">
                      <div className="text" dir="auto">
                        {answer ? richText(answer) : <Spinner size={18} />}
                        {answer && <span className="ai-cursor" />}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {problem && <div className="banner error">{problem}</div>}
              <div ref={bottom} />
            </div>
          </div>
          <form
            className="composer assistant-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft);
            }}
          >
            <textarea
              rows={1}
              dir="auto"
              value={draft}
              placeholder={t('ai_ask')}
              aria-label={t('ai_ask')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !window.matchMedia('(pointer: coarse)').matches) {
                  e.preventDefault();
                  void ask(draft);
                }
              }}
            />
            <button type="submit" className="send-btn" disabled={!draft.trim() || answer !== null} aria-label={t('send')}>
              <Icon name="send" size={20} fill />
            </button>
          </form>
        </>
      )}
      {settings && <AiSettingsDialog onClose={() => setSettings(false)} />}
    </div>
  );
}
