import type { Lang } from '../../../shared/types.ts';
import { en } from '../locales/en.ts';
import { es } from '../locales/es.ts';
import { fr } from '../locales/fr.ts';
import { ru } from '../locales/ru.ts';
import { useStore } from './store.ts';

/** A translation is a plain string, or plural forms keyed by Intl.PluralRules categories. */
export type Entry = string | ({ other: string } & Partial<Record<Intl.LDMLPluralRule, string>>);
export type Key = keyof typeof fr;
export type Dict = Record<Key, Entry>;

const DICTS: Record<Lang, Dict> = { fr, en, es, ru };
const rules = new Map<Lang, Intl.PluralRules>();

export type Vars = Record<string, string | number>;
export type T = (key: Key, vars?: Vars) => string;

export function translate(lang: Lang, key: Key, vars?: Vars): string {
  const entry = DICTS[lang][key] ?? DICTS.fr[key] ?? key;
  let text: string;
  if (typeof entry === 'string') text = entry;
  else {
    let rule = rules.get(lang);
    if (!rule) rules.set(lang, (rule = new Intl.PluralRules(lang)));
    const n = typeof vars?.n === 'number' ? vars.n : 0;
    text = entry[rule.select(n)] ?? entry.other;
  }
  if (vars) for (const k in vars) text = text.replaceAll(`{${k}}`, String(vars[k]));
  return text;
}

/** Hook returning a translate function bound to the current language. */
export function useT(): T {
  const lang = useStore((s) => s.lang);
  return (key, vars) => translate(lang, key, vars);
}

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem('ot_lang');
    if (saved === 'fr' || saved === 'en' || saved === 'es' || saved === 'ru') return saved;
  } catch {
    /* storage unavailable */
  }
  const nav = (navigator.language || 'fr').slice(0, 2).toLowerCase();
  // Hebrew and Ukrainian speakers are, for now, best served by the closest available worlds.
  if (nav === 'uk' || nav === 'be') return 'ru';
  return nav === 'en' || nav === 'es' || nav === 'ru' || nav === 'fr' ? nav : 'en';
}
