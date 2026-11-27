// Relay mode: what is handed over to the person's own AI application.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_APPS, AI_APP_ORDER, isAiApp, relayRequest, relayUrl } from './ai/relay.ts';

test('the request travels in the address only for the applications known to accept it', () => {
  const request = 'Traduis ce message en français.\n\nПривет, как дела? & co';
  const chatgpt = new URL(relayUrl('chatgpt', request)!);
  assert.equal(chatgpt.origin + chatgpt.pathname, 'https://chatgpt.com/');
  assert.equal(chatgpt.searchParams.get('q'), request, 'accents, Cyrillic, line breaks and & survive');
  assert.equal(new URL(relayUrl('mistral', request)!).searchParams.get('q'), request);
  // The others open on a new conversation; the copied request is pasted there.
  assert.equal(relayUrl('claude', request), 'https://claude.ai/new');
  assert.equal(relayUrl('gemini', request), 'https://gemini.google.com/app');
  assert.equal(relayUrl('copilot', request), 'https://copilot.microsoft.com/');
  // "Another application" has no address: it goes through the share sheet.
  assert.equal(relayUrl('other', request), null);
});

test('a long request is shortened in the address, not in what is copied', () => {
  const long = 'שלום '.repeat(2000); // 10 000 characters
  const inAddress = new URL(relayUrl('chatgpt', long)!).searchParams.get('q')!;
  assert.equal(inAddress.length, 1500);
  assert.ok(inAddress.endsWith('…'));
  const request = relayRequest('Explique ce message.\n\n{text}', long);
  assert.ok(request.startsWith('Explique ce message.\n\nשלום'));
  assert.ok(request.length > 9000 && request.length <= 12_000);
});

test('requests are built from a template and the text', () => {
  assert.equal(relayRequest('Traduis en français :\n\n{text}', '  Спасибо!  '), 'Traduis en français :\n\nСпасибо!');
});

test('only known applications are accepted as a saved choice', () => {
  assert.deepEqual(AI_APP_ORDER.filter(isAiApp), AI_APP_ORDER);
  assert.ok(AI_APP_ORDER.every((id) => AI_APPS[id].id === id));
  for (const bad of [null, undefined, '', 'bard', 'constructor', 42]) assert.equal(isAiApp(bad), false, String(bad));
});
