import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectLang, needsTranslation } from './lang.ts';

test('recognises the four worlds and Hebrew in everyday chat messages', () => {
  const samples: [string, ReturnType<typeof detectLang>][] = [
    ['Bonjour à tous, quelqu’un connaît un bon oulpan près de Dizengoff ?', 'fr'],
    ['Salut, je cherche un appart a Tel Aviv pour le mois prochain', 'fr'],
    ["J'ai rendez-vous au misrad hapnim demain", 'fr'],
    ['Merci beaucoup !', 'fr'],
    ['Hi everyone, does anyone know a good ulpan near Dizengoff?', 'en'],
    ["I'm looking for a flat in Jerusalem, any tips?", 'en'],
    ['Thanks a lot, that is really helpful', 'en'],
    ['Hola a todos, ¿alguien conoce un buen ulpán cerca de Dizengoff?', 'es'],
    ['Necesito ayuda con los papeles del banco, gracias', 'es'],
    ['Muchas gracias por la ayuda', 'es'],
    ['Всем привет! Кто-нибудь знает хороший ульпан рядом с Дизенгоф?', 'ru'],
    ['Спасибо', 'ru'],
    ['Завтра иду в Misrad HaPnim за теудат зеут', 'ru'],
    ['שלום לכולם, מישהו מכיר אולפן טוב?', 'he'],
    ['אני צריך עזרה עם ה-teudat zehut', 'he'],
  ];
  for (const [text, expected] of samples) assert.equal(detectLang(text), expected, text);
});

test('does not guess when there is nothing to go on', () => {
  for (const text of ['👍', 'ok', '😂😂😂', 'https://example.com/page?x=1', '@david.levy', '12:30', 'Tel Aviv', 'Shalom']) {
    assert.equal(detectLang(text), null, text);
  }
});

test('links, mentions and formatting marks do not disturb the guess', () => {
  assert.equal(detectLang('*Важно*: встреча завтра https://example.com/the-meeting-is-here @naomie.cohen'), 'ru');
  assert.equal(detectLang('Voici le lien : https://example.com/the-best-guide-for-you'), 'fr');
});

test('a message is translated only for someone who does not read its language', () => {
  const russian = 'Всем привет! Где можно обменять водительские права?';
  assert.equal(needsTranslation(russian, 'fr'), true);
  assert.equal(needsTranslation(russian, 'ru'), false);
  assert.equal(needsTranslation(russian, 'fr', ['ru']), false, 'the reader said they also read Russian');
  assert.equal(needsTranslation('Bonjour, comment ça va ?', 'fr'), false);
  assert.equal(needsTranslation('Hello, how are you doing today?', 'fr', ['en']), false);
  assert.equal(needsTranslation('שלום, מה שלומך היום?', 'fr'), true, 'Hebrew is translated too');
});

test('an unrecognised message relies on the language of the place it was written in', () => {
  // Too little to recognise on its own…
  assert.equal(detectLang('Vamos mañana'), 'es');
  assert.equal(detectLang('Perfecto amigo'), null);
  // …so the group's language decides, for anything longer than a word.
  assert.equal(needsTranslation('Perfecto amigo', 'fr', [], 'es'), true);
  assert.equal(needsTranslation('Perfecto amigo', 'fr', [], 'fr'), false);
  assert.equal(needsTranslation('Perfecto amigo', 'fr', [], null), false);
  assert.equal(needsTranslation('ok', 'fr', [], 'es'), false);
  assert.equal(needsTranslation('👍👍', 'fr', [], 'ru'), false);
});
