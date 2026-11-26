import type { Lang } from './types.ts';

export type L = Record<Lang, string>;

/** Cities with an olim presence. `key` is stable and stored on users / chats. */
export const CITIES: { key: string; name: L }[] = [
  { key: 'jerusalem', name: { fr: 'Jérusalem', en: 'Jerusalem', es: 'Jerusalén', ru: 'Иерусалим' } },
  { key: 'tel-aviv', name: { fr: 'Tel Aviv', en: 'Tel Aviv', es: 'Tel Aviv', ru: 'Тель-Авив' } },
  { key: 'haifa', name: { fr: 'Haïfa', en: 'Haifa', es: 'Haifa', ru: 'Хайфа' } },
  { key: 'netanya', name: { fr: 'Netanya', en: 'Netanya', es: 'Netanya', ru: 'Нетания' } },
  { key: 'ashdod', name: { fr: 'Ashdod', en: 'Ashdod', es: 'Ashdod', ru: 'Ашдод' } },
  { key: 'raanana', name: { fr: 'Raanana', en: "Ra'anana", es: 'Raanana', ru: 'Раанана' } },
  { key: 'beer-sheva', name: { fr: 'Beer Sheva', en: "Be'er Sheva", es: 'Beer Sheva', ru: 'Беэр-Шева' } },
  { key: 'ashkelon', name: { fr: 'Ashkelon', en: 'Ashkelon', es: 'Ashkelon', ru: 'Ашкелон' } },
  { key: 'herzliya', name: { fr: 'Herzliya', en: 'Herzliya', es: 'Herzliya', ru: 'Герцлия' } },
  { key: 'rishon-lezion', name: { fr: 'Rishon LeZion', en: 'Rishon LeZion', es: 'Rishon LeZion', ru: 'Ришон-ле-Цион' } },
  { key: 'petah-tikva', name: { fr: 'Petah Tikva', en: 'Petah Tikva', es: 'Petaj Tikva', ru: 'Петах-Тиква' } },
  { key: 'ramat-gan', name: { fr: 'Ramat Gan', en: 'Ramat Gan', es: 'Ramat Gan', ru: 'Рамат-Ган' } },
  { key: 'bat-yam', name: { fr: 'Bat Yam', en: 'Bat Yam', es: 'Bat Yam', ru: 'Бат-Ям' } },
  { key: 'holon', name: { fr: 'Holon', en: 'Holon', es: 'Holón', ru: 'Холон' } },
  { key: 'modiin', name: { fr: 'Modiin', en: "Modi'in", es: 'Modiín', ru: 'Модиин' } },
  { key: 'rehovot', name: { fr: 'Rehovot', en: 'Rehovot', es: 'Rejovot', ru: 'Реховот' } },
  { key: 'kfar-saba', name: { fr: 'Kfar Saba', en: 'Kfar Saba', es: 'Kfar Saba', ru: 'Кфар-Саба' } },
  { key: 'beit-shemesh', name: { fr: 'Beit Shemesh', en: 'Beit Shemesh', es: 'Beit Shemesh', ru: 'Бейт-Шемеш' } },
  { key: 'hadera', name: { fr: 'Hadera', en: 'Hadera', es: 'Hadera', ru: 'Хадера' } },
  { key: 'nahariya', name: { fr: 'Nahariya', en: 'Nahariya', es: 'Nahariya', ru: 'Нагария' } },
  { key: 'tiberias', name: { fr: 'Tibériade', en: 'Tiberias', es: 'Tiberíades', ru: 'Тверия' } },
  { key: 'karmiel', name: { fr: 'Karmiel', en: 'Karmiel', es: 'Karmiel', ru: 'Кармиэль' } },
  { key: 'eilat', name: { fr: 'Eilat', en: 'Eilat', es: 'Eilat', ru: 'Эйлат' } },
];

/**
 * The four language "worlds". We deliberately use language codes rather than
 * national flags: each language is spoken by olim from many countries.
 */
export const WORLD_META: Record<Lang, { code: string; label: string; native: string; color: string }> = {
  fr: { code: 'FR', label: 'Français', native: 'Monde francophone', color: '#2F6BFF' },
  en: { code: 'EN', label: 'English', native: 'English-speaking world', color: '#E5484D' },
  es: { code: 'ES', label: 'Español', native: 'Mundo hispanohablante', color: '#F08C00' },
  ru: { code: 'RU', label: 'Русский', native: 'Русскоязычный мир', color: '#12A594' },
};

export const PROFILE_EMOJI: Record<string, string> = {
  student: '🎓',
  entrepreneur: '🚀',
  employee: '💼',
  medical: '🩺',
  legal: '⚖️',
};

export const CATEGORY_EMOJI: Record<string, string> = {
  city: '🏙️',
  event: '🎉',
  sport: '⚽',
  profile: '🧭',
  general: '💬',
};

export function cityName(key: string | null | undefined, lang: Lang): string {
  if (!key) return '';
  return CITIES.find((c) => c.key === key)?.name[lang] ?? key;
}
