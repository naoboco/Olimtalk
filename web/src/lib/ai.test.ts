// The "own AI" adapters, exercised against simulated provider responses.
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { AiError, complete, isConfigured, listModels, type AiSettings } from './ai/index.ts';

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: any;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replace fetch with a scripted sequence of responses; returns the calls that were made. */
function script(...responses: (() => Response)[]): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const text = await request.text();
    calls.push({ url: request.url, method: request.method, headers: request.headers, body: text ? JSON.parse(text) : undefined });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request to ${request.url}`);
    return next();
  }) as typeof fetch;
  return calls;
}

const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A streamed Claude answer, as the Messages API sends it. */
function claudeStream(pieces: string[], stopReason = 'end_turn') {
  const events: [string, unknown][] = [
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ...pieces.map((text): [string, unknown] => ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }]),
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 5 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  const body = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
  return () => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const claude: AiSettings = { provider: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-opus-5-5' };
const ask = { system: 'Réponds en français.', messages: [{ role: 'user' as const, content: 'Shalom' }] };

test('Claude: streamed through the official SDK, straight from the device, with the refusal fallback', async () => {
  const calls = script(claudeStream(['Bon', 'jour', ' !']));
  const pieces: string[] = [];
  const answer = await complete(claude, { ...ask, onText: (t) => pieces.push(t) });
  assert.equal(answer, 'Bonjour !');
  assert.deepEqual(pieces, ['Bon', 'jour', ' !']);
  const [call] = calls;
  assert.equal(new URL(call!.url).hostname, 'api.anthropic.com');
  assert.equal(new URL(call!.url).pathname, '/v1/messages');
  // The SDK decides how the key is presented; what matters is that it goes to Anthropic and nowhere else.
  assert.ok(call!.headers.get('x-api-key') === 'sk-ant-test' || call!.headers.get('authorization') === 'Bearer sk-ant-test');
  assert.equal(call!.headers.get('anthropic-dangerous-direct-browser-access'), 'true');
  assert.match(call!.headers.get('anthropic-beta') ?? '', /server-side-fallback-2026-07-01/);
  assert.equal(call!.body.model, 'claude-opus-5-5');
  assert.equal(call!.body.fallbacks, 'default');
  assert.equal(call!.body.stream, true);
  assert.equal(call!.body.system, 'Réponds en français.');
  assert.deepEqual(call!.body.messages, [{ role: 'user', content: 'Shalom' }]);
  assert.equal(call!.body.max_tokens, 16000);
  // Nothing that only some models accept is sent.
  for (const field of ['thinking', 'temperature', 'top_p', 'output_config']) assert.equal(field in call!.body, false, field);
});

test('Claude: an account without the fallback beta still gets its answer', async () => {
  const calls = script(json(400, { type: 'error', error: { type: 'invalid_request_error', message: 'fallbacks: unknown field' } }), claudeStream(['D’accord.']));
  assert.equal(await complete(claude, ask), 'D’accord.');
  assert.equal(calls.length, 2);
  assert.equal('fallbacks' in calls[1]!.body, false);
  assert.equal(calls[1]!.headers.get('anthropic-beta'), null);
});

test('Claude: other models get a plain request, capped to what the model accepts', async () => {
  const calls = script(claudeStream(['ok']));
  await complete({ ...claude, model: 'claude-haiku-4-5', maxOutput: 8192 }, ask);
  assert.equal(calls.length, 1);
  assert.equal('fallbacks' in calls[0]!.body, false);
  assert.equal(calls[0]!.body.max_tokens, 8192);
});

test('Claude: refusals and errors are reported as such', async () => {
  script(claudeStream([], 'refusal'));
  await assert.rejects(complete({ ...claude, model: 'claude-haiku-5-5' }, ask), (e: unknown) => e instanceof AiError && e.code === 'refused');
  script(json(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
  await assert.rejects(complete({ ...claude, model: 'claude-haiku-5-5' }, ask), (e: unknown) => e instanceof AiError && e.code === 'invalid_key');
  script(json(404, { type: 'error', error: { type: 'not_found_error', message: 'model: nope' } }));
  await assert.rejects(complete({ ...claude, model: 'nope' }, ask), (e: unknown) => e instanceof AiError && e.code === 'bad_request');
});

test('Claude: the key is checked by listing the models it can use', async () => {
  const calls = script(
    json(200, {
      data: [
        { type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-09-01T00:00:00Z', max_tokens: 128000, max_input_tokens: 1000000, lifecycle: 'active', capabilities: null, deprecated_at: null, retires_at: null, line: null },
        { type: 'model', id: 'claude-old', display_name: 'Old', created_at: '2024-01-01T00:00:00Z', max_tokens: 4096, max_input_tokens: 200000, lifecycle: 'retired', capabilities: null, deprecated_at: null, retires_at: null, line: null },
      ],
      has_more: false,
      first_id: 'claude-opus-5-5',
      last_id: 'claude-old',
    }),
  );
  assert.deepEqual(await listModels(claude), [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5', maxOutput: 128000 }]);
  assert.equal(new URL(calls[0]!.url).pathname, '/v1/models');
});

test('OpenAI-compatible services: OpenAI, Mistral, or any address the person gives', async () => {
  const reply = json(200, { choices: [{ message: { role: 'assistant', content: 'Bonjour !' }, finish_reason: 'stop' }] });
  let calls = script(reply);
  assert.equal(await complete({ provider: 'openai', apiKey: 'sk-test', model: 'some-model' }, ask), 'Bonjour !');
  assert.equal(calls[0]!.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0]!.headers.get('authorization'), 'Bearer sk-test');
  assert.deepEqual(calls[0]!.body, { model: 'some-model', messages: [{ role: 'system', content: 'Réponds en français.' }, { role: 'user', content: 'Shalom' }] });

  calls = script(reply);
  await complete({ provider: 'mistral', apiKey: 'm-key', model: 'm' }, ask);
  assert.equal(calls[0]!.url, 'https://api.mistral.ai/v1/chat/completions');

  // A model running on the person's own computer needs no key at all.
  calls = script(reply);
  await complete({ provider: 'custom', apiKey: '', model: 'llama', baseUrl: 'http://localhost:11434/v1/' }, ask);
  assert.equal(calls[0]!.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(calls[0]!.headers.get('authorization'), null);

  script(json(429, { error: { message: 'slow down' } }));
  await assert.rejects(complete({ provider: 'openai', apiKey: 'k', model: 'm' }, ask), (e: unknown) => e instanceof AiError && e.code === 'rate_limited' && e.message === 'slow down');
  script(json(200, { choices: [{ message: { content: null, refusal: 'no' } }] }));
  await assert.rejects(complete({ provider: 'openai', apiKey: 'k', model: 'm' }, ask), (e: unknown) => e instanceof AiError && e.code === 'refused');
  await assert.rejects(complete({ provider: 'custom', apiKey: '', model: 'm', baseUrl: 'ftp://nope' }, ask), (e: unknown) => e instanceof AiError && e.code === 'bad_request');

  calls = script(json(200, { data: [{ id: 'b-model' }, { id: 'a-model' }] }));
  assert.deepEqual((await listModels({ provider: 'openai', apiKey: 'k', model: '' })).map((m) => m.id), ['a-model', 'b-model']);
  assert.equal(calls[0]!.url, 'https://api.openai.com/v1/models');
});

test('Gemini: its own request shape', async () => {
  const calls = script(json(200, { candidates: [{ content: { parts: [{ text: 'Bon' }, { text: 'jour' }] }, finishReason: 'STOP' }] }));
  const answer = await complete(
    { provider: 'gemini', apiKey: 'g-key', model: 'models/gemini-x' },
    { system: 'Sois bref.', messages: [{ role: 'user', content: 'Un' }, { role: 'assistant', content: 'Deux' }, { role: 'user', content: 'Trois' }] },
  );
  assert.equal(answer, 'Bonjour');
  assert.equal(calls[0]!.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
  assert.equal(calls[0]!.headers.get('x-goog-api-key'), 'g-key');
  assert.ok(!calls[0]!.url.includes('g-key'), 'the key is not put in the address');
  assert.deepEqual(calls[0]!.body.systemInstruction, { parts: [{ text: 'Sois bref.' }] });
  assert.deepEqual(calls[0]!.body.contents.map((c: { role: string }) => c.role), ['user', 'model', 'user']);

  script(json(200, { promptFeedback: { blockReason: 'SAFETY' } }));
  await assert.rejects(complete({ provider: 'gemini', apiKey: 'k', model: 'm' }, ask), (e: unknown) => e instanceof AiError && e.code === 'refused');
  script(json(200, { models: [{ name: 'models/gemini-x', displayName: 'Gemini X', outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] }));
  assert.deepEqual(await listModels({ provider: 'gemini', apiKey: 'k', model: '' }), [{ id: 'gemini-x', name: 'Gemini X', maxOutput: 8192 }]);
});

test('a connection counts as ready only when it can actually be used', () => {
  assert.equal(isConfigured(undefined), false);
  assert.equal(isConfigured({ provider: 'anthropic', apiKey: '', model: 'claude-opus-5-5' }), false);
  assert.equal(isConfigured({ provider: 'anthropic', apiKey: 'k', model: '' }), false);
  assert.equal(isConfigured({ provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' }), true);
  assert.equal(isConfigured({ provider: 'custom', apiKey: '', model: 'llama', baseUrl: 'http://localhost:11434/v1' }), true);
  assert.equal(isConfigured({ provider: 'custom', apiKey: '', model: 'llama' }), false);
});
