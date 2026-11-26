// Which language is this message written in? A small, offline guess, good enough to decide
// whether a message needs translating for its reader. Scripts settle Russian and Hebrew;
// French, English and Spanish are told apart by their most common little words.
import type { Lang } from './types.ts';

/** The four worlds, plus what else turns up in olim conversations. */
export type DetectedLang = Lang | 'he' | 'ar' | 'other';

const words = (list: string) => new Set(list.split(/\s+/).filter(Boolean));

// Everyday words of each language, as typed in a chat (accents are often dropped).
const COMMON: Record<'fr' | 'en' | 'es', Set<string>> = {
  fr: words(`
    le la les un une des du de et est en que qui dans pour pas ne je tu il elle nous vous ils elles on ce cette ces
    mon ma mes ton ta tes son sa ses notre votre leur leurs au aux avec sur sous mais ou où donc car si très tres plus
    bien merci bonjour bonsoir salut oui non ça ca cela c j l d qu n s t y m ai as a avez avons ont suis es êtes etes
    sont était etait été ete fait faire fais quoi quand comment pourquoi chez aussi tout tous toute toutes ici là
    alors comme encore déjà deja peut peux veux veut dois doit faut besoin quelqu quelque quelques quel quelle
    aujourd hui demain hier soir matin semaine après apres avant pendant depuis entre vers chez sans jamais toujours
    beaucoup peu trop assez moi toi lui eux aide svp stp voici voilà voila bienvenue à
  `),
  en: words(`
    the a an and is are was were be been being to of in on at for with not no yes i you he she it we they this that
    these those my your his her our their its have has had do does did done but or so if very more most thanks
    thank hello hi hey what when how why where who which can could will would should shall may might must there here
    just about from into over after before during since until than then also any some all both each every other
    anyone someone something anything everyone please welcome need want know think looking help me him them us am
    don doesn didn isn aren wasn won can't cannot let get got go going today tomorrow yesterday week morning evening
    good great new really much many few too
  `),
  es: words(`
    el la los las un una unos unas de del y e es en que no sí si yo tú tu él ella nosotros vosotros ustedes usted
    ellos ellas por para con sin pero o u muy más mas gracias hola buenos buenas días dias tardes noches qué que
    cuándo cuando cómo como dónde donde quién quien cuál cual mi mis tus su sus este esta estos estas ese esa eso
    esto al lo le les se me te nos hay está esta están estan estoy estás estas soy eres somos son tengo tienes tiene
    tienen hacer hago hace también tambien aquí aqui allí alli todo todos toda todas alguien algo nada nadie porque
    necesito quiero puedo puede pueden hoy mañana manana ayer semana tarde noche después despues antes desde hasta
    entre bien mucho mucha muchos pocos ayuda favor bienvenido bienvenidos ya solo sólo siempre nunca
  `),
};

const STRIP = /https?:\/\/\S+|www\.\S+|@[a-zA-Z0-9_.]{3,30}|[*_~`]/g;

/**
 * The language a text is most probably written in, or null when it is too short or too
 * ambiguous to say (an emoji, "ok", a name, a link).
 */
export function detectLang(text: string): DetectedLang | null {
  const clean = text.replace(STRIP, ' ').toLowerCase();
  const count = (re: RegExp) => clean.match(re)?.length ?? 0;
  const latin = count(/\p{Script=Latin}/gu);
  const cyrillic = count(/\p{Script=Cyrillic}/gu);
  const hebrew = count(/\p{Script=Hebrew}/gu);
  const arabic = count(/\p{Script=Arabic}/gu);
  const letters = count(/\p{L}/gu);
  if (letters < 2) return null;

  // A script that carries most of the letters decides on its own.
  const share = (n: number) => n / letters;
  if (share(cyrillic) >= 0.5) return 'ru';
  if (share(hebrew) >= 0.5) return 'he';
  if (share(arabic) >= 0.5) return 'ar';
  if (share(latin) < 0.5) return latin + cyrillic + hebrew + arabic < letters / 2 ? 'other' : null;

  const tokens = clean.match(/\p{Script=Latin}+/gu) ?? [];
  const score = { fr: 0, en: 0, es: 0 };
  for (const token of tokens) {
    const langs = (['fr', 'en', 'es'] as const).filter((l) => COMMON[l].has(token));
    // A word that only one of the three uses says much more than a shared one ("la", "de", "no").
    for (const l of langs) score[l] += 1 / (langs.length * langs.length);
  }
  // Letters and signs that give a language away.
  score.es += 1.5 * count(/[ñ¿¡]/g) + 0.5 * count(/[áíóú]/g);
  score.fr += 1.5 * count(/[çœ]|[a-z]'[a-zàâéèêëîïôùûç]/g) + 0.5 * count(/[àâèêëîïôùû]/g);
  score.en += 1.5 * count(/\b(?:i'm|it's|don't|doesn't|didn't|can't|won't|isn't|i've|i'll|you're|that's|what's)\b/g);

  const ranked = (Object.entries(score) as ['fr' | 'en' | 'es', number][]).sort((a, b) => b[1] - a[1]);
  const [best, second] = [ranked[0]!, ranked[1]!];
  // Enough evidence, and clearly ahead of the runner-up.
  if (best[1] >= 1 && best[1] >= second[1] * 1.5 && best[1] - second[1] >= 0.5) return best[0];
  return null;
}

/**
 * Should this text be translated for someone who reads `viewer` (and `alsoReads`)?
 * `prior` is the language the text is expected to be in when it cannot be recognised:
 * the language of the group, or of the person who wrote it.
 */
export function needsTranslation(text: string, viewer: Lang, alsoReads: readonly string[] = [], prior: string | null = null): boolean {
  const understood = (lang: string) => lang === viewer || alsoReads.includes(lang);
  const detected = detectLang(text);
  if (detected) return !understood(detected);
  if (!prior || understood(prior)) return false;
  // Unrecognised, in a place where another language is spoken: worth asking, unless it is
  // only a word or two (a name, "ok", "amen").
  const tokens = text.replace(STRIP, ' ').match(/\p{L}{2,}/gu) ?? [];
  return tokens.length >= 2 && tokens.join('').length >= 8;
}
