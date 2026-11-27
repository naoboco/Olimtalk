import type { Lang } from '../../../../shared/types.ts';
import { AiError, type AiModel, type AiRequest, type AiSettings, type ChatTurn } from './types.ts';

export { AiError, type AiModel, type AiRequest, type AiSettings, type ChatTurn };

export interface ProviderInfo {
  label: string;
  /** Where the person creates their key. */
  site: string;
  /** Suggested model; empty when it is better chosen from the provider's own list. */
  defaultModel: string;
  needsBaseUrl?: boolean;
}

export const PROVIDERS: Record<AiSettings['provider'], ProviderInfo> = {
  anthropic: { label: 'Claude (Anthropic)', site: 'https://platform.claude.com', defaultModel: 'claude-opus-5-5' },
  openai: { label: 'ChatGPT (OpenAI)', site: 'https://platform.openai.com', defaultModel: '' },
  gemini: { label: 'Gemini (Google)', site: 'https://aistudio.google.com', defaultModel: '' },
  mistral: { label: 'Mistral', site: 'https://console.mistral.ai', defaultModel: '' },
  // Usually connected by signing in (see openrouter.ts); a key pasted by hand works too.
  openrouter: { label: 'OpenRouter', site: 'https://openrouter.ai', defaultModel: 'openrouter/auto' },
  custom: { label: 'OpenAI-compatible', site: '', defaultModel: '', needsBaseUrl: true },
};

export const isConfigured = (settings: AiSettings | undefined): settings is AiSettings =>
  !!settings && !!settings.model && (settings.provider === 'custom' ? !!settings.baseUrl : !!settings.apiKey);

// Each provider's code is loaded the first time it is used: most people never open it.

/** Ask the person's own AI. Resolves with the full answer. */
export async function complete(settings: AiSettings, request: AiRequest): Promise<string> {
  switch (settings.provider) {
    case 'anthropic':
      return (await import('./anthropic.ts')).anthropicComplete(settings, request);
    case 'gemini':
      return (await import('./gemini.ts')).geminiComplete(settings, request);
    default:
      return (await import('./openai-compatible.ts')).openAiCompatibleComplete(settings, request);
  }
}

/** The models the key gives access to — also the simplest way to check that the key works. */
export async function listModels(settings: AiSettings): Promise<AiModel[]> {
  switch (settings.provider) {
    case 'anthropic':
      return (await import('./anthropic.ts')).anthropicModels(settings);
    case 'gemini':
      return (await import('./gemini.ts')).geminiModels(settings);
    default:
      return (await import('./openai-compatible.ts')).openAiCompatibleModels(settings);
  }
}

// ───────────── what OlimTalk asks the assistant ─────────────

const LANGUAGE: Record<Lang, string> = { fr: 'French', en: 'English', es: 'Spanish', ru: 'Russian' };
export const languageName = (lang: Lang) => LANGUAGE[lang];

export function assistantSystem(lang: Lang): string {
  return [
    `You are the personal assistant of someone who recently moved to Israel (an oleh or olah) and uses the OlimTalk app. Answer in ${LANGUAGE[lang]} unless they write in another language.`,
    'They often need help with Hebrew, with letters and e-mails from Israeli institutions, and with everyday paperwork. Be concrete: say what the document or situation means for them and what to do next.',
    'For questions about official procedures, health, law or taxes, explain the general process and name the body that decides (for example Misrad HaPnim, Misrad HaKlita, Bituach Leumi, their kupat holim, the tax authority). Rules and amounts change: when something matters, tell them to confirm it with that body or a professional, and do not invent figures, dates or deadlines.',
    'When you are not sure, say so plainly.',
  ].join('\n\n');
}

export const translateRequest = (text: string, lang: Lang): AiRequest => ({
  system: `You translate messages for a reader whose language is ${LANGUAGE[lang]}. Reply with the translation only, keeping the tone, names, numbers and line breaks. If the text is already in ${LANGUAGE[lang]}, reply with it unchanged.`,
  messages: [{ role: 'user', content: text }],
});

export const explainRequest = (text: string, lang: Lang): AiRequest => ({
  system: `${assistantSystem(lang)}\n\nThe person shares a message or document they received. In ${LANGUAGE[lang]}: first say in one or two sentences what it is about, then list what it asks of them and any date, amount or reference it contains, then say what they should do next. Translate the Hebrew terms that matter and keep the original term in brackets.`,
  messages: [{ role: 'user', content: text }],
});

export const summarizeRequest = (transcript: string, lang: Lang): AiRequest => ({
  system: `You summarise a group conversation for someone who was away, in ${LANGUAGE[lang]}. Give the main topics, any decision, date, place or request addressed to the group, and unanswered questions. Use short bullet points. Mention who said what only when it matters. Do not add anything that is not in the conversation.`,
  messages: [{ role: 'user', content: transcript }],
});

export const rewriteRequest = (text: string, instruction: 'improve' | 'hebrew' | 'english', lang: Lang): AiRequest => ({
  system:
    instruction === 'improve'
      ? `Correct and lightly polish the following message, in the language it is written in (the writer's own language is ${LANGUAGE[lang]}). Keep the meaning, the tone and the length. Reply with the message only.`
      : `Translate the following message into ${instruction === 'hebrew' ? 'everyday modern Hebrew' : 'English'}, as someone would naturally write it in a chat. Reply with the translation only.`,
  messages: [{ role: 'user', content: text }],
});
