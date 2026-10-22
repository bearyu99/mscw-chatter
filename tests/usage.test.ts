import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyUsage, estimateUsd, parseUsage, UsageLedger, type UsageEvent } from '../src/shared/usage';
import { keyIdentity, UsageStore } from '../electron/core/usage-store';
import { translateWithProvider, type TranslationRequest } from '../electron/core/providers';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const at = Date.UTC(2026, 9, 22);
const input: TranslationRequest = { provider: 'openai', profile: { model: 'gpt-4.1-mini', endpoint: '', localApi: 'openai' }, apiKey: 'test-only-key', text: '안녕하세요', direction: 'ko-en', glossaryEnabled: false, signal: new AbortController().signal };
const raw = { model: 'gpt-4.1-mini-2025-04-14', usage: { prompt_tokens: 1000, completion_tokens: 400, prompt_tokens_details: { cached_tokens: 250 }, completion_tokens_details: { reasoning_tokens: 100 } }, choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }] };
describe('token usage and verified pricing', () => {
  it('prices all new defaults and the Gemini 2.5 Flash-Lite alternative', () => {
    const usage = parseUsage('openai', raw)!;
    expect(estimateUsd('openai', 'gpt-6-luna', usage, at)).toBeCloseTo(0.0002775, 12);
    expect(estimateUsd('anthropic', 'claude-haiku-5-5', usage, at)).toBeCloseTo(0.0002775, 12);
    expect(estimateUsd('google', 'gemini-3.5-flash-lite', usage, at)).toBeCloseTo(0.0012325, 12);
    expect(estimateUsd('google', 'gemini-2.5-flash-lite', usage, at)).toBeCloseTo(0.0002375, 12);
  });
  it('prices GPT-6 cache writes without counting them as normal prompt input', () => {
    const usage = parseUsage('openai', { usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 } } })!;
    expect(estimateUsd('openai', 'gpt-6-luna', usage, at)).toBeCloseTo(0.0001395, 12);
    expect(estimateUsd('openai', 'gpt-4.1-mini', usage, at)).toBeNull();
  });
  it('applies documented long-input thresholds to the new model rates', () => {
    const usage = { ...parseUsage('openai', raw)!, inputTokens: 300000, cachedInputTokens: 0 };
    expect(estimateUsd('openai', 'gpt-6-luna', usage, at)).toBeCloseTo(0.0603, 12);
    expect(estimateUsd('anthropic', 'claude-haiku-5-5', usage, at)).toBeCloseTo(0.151, 12);
  });
  it('subtracts cached OpenAI input and never doubles reasoning output', () => {
    const usage = parseUsage('openai', raw)!;
    expect(usage).toMatchObject({ inputTokens: 1000, outputTokens: 400, cachedInputTokens: 250 });
    expect(estimateUsd('openai', raw.model, usage, at)).toBeCloseTo(0.000965, 12);
  });
  it('accounts for Anthropic cache writes separately from base input and hits', () => {
    const usage = parseUsage('anthropic', { usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 200, cache_creation_input_tokens: 100, cache_creation: { ephemeral_5m_input_tokens: 40, ephemeral_1h_input_tokens: 60 } } })!;
    expect(usage.inputTokens).toBe(400);
    expect(estimateUsd('anthropic', 'claude-haiku-4-5', usage, at)).toBeCloseTo((100 + 250 + 20 + 50 + 120) / 1e6, 12);
  });
  it('includes Gemini thinking tokens and applies the announced price transition', () => {
    const usage = parseUsage('google', { usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 200, candidatesTokenCount: 50, thoughtsTokenCount: 100 } })!;
    expect(usage.outputTokens).toBe(150);
    expect(estimateUsd('google', 'gemini-3.8-flash', usage, at)).toBeCloseTo(0.0011775, 12);
    expect(estimateUsd('google', 'gemini-3.8-flash', usage, Date.UTC(2027, 0, 1))).toBeCloseTo(0.002355, 12);
    expect(estimateUsd('google', 'gemini-2.5-flash', usage, at)).toBeCloseTo(0.000621, 12);
  });
  it('does not turn missing, malformed, or unsupported usage into free requests', () => {
    for (const data of [{}, { usage: { prompt_tokens: -1, completion_tokens: 1 } }, { usage: { prompt_tokens: 1, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 2 } } }, { usage: { prompt_tokens: '100', completion_tokens: 1 } }]) expect(parseUsage('openai', data)).toBeNull();
    expect(estimateUsd('openai', 'unverified-model', parseUsage('openai', raw)!, at)).toBeNull();
  });
});
describe('accounting at the transport boundary', () => {
  it('collects usage even when returned text is truncated', async () => {
    const events: UsageEvent[] = [];
    await expect(translateWithProvider(input, async () => Response.json({ ...raw, choices: [{ finish_reason: 'length' }] }), event => { events.push(event); })).rejects.toThrow('잘렸');
    expect(events).toHaveLength(1); expect(events[0].usage?.outputTokens).toBe(400);
  });
  it('marks an unavailable response uncertain and does not estimate it', async () => {
    const events: UsageEvent[] = [];
    await expect(translateWithProvider(input, async () => { throw new TypeError('network'); }, event => { events.push(event); })).rejects.toThrow('연결');
    expect(events).toHaveLength(1); expect(events[0].usage).toBeNull();
  });
  it('does not count a request that was canceled before dispatch', async () => {
    const events: UsageEvent[] = [], abort = new AbortController(); abort.abort();
    await expect(translateWithProvider({ ...input, signal: abort.signal }, async () => Response.json(raw), event => { events.push(event); })).rejects.toThrow();
    expect(events).toHaveLength(0);
  });
  it('retains returned usage when cancellation arrives with the response', async () => {
    const events: UsageEvent[] = [], abort = new AbortController();
    await expect(translateWithProvider({ ...input, signal: abort.signal }, async () => { abort.abort(); return Response.json(raw); }, event => { events.push(event); })).rejects.toThrow();
    expect(events).toHaveLength(1); expect(events[0].usage).not.toBeNull();
  });
});
describe('private per-key usage ledger', () => {
  it('isolates keys and providers, and explicitly counts missing prices and responses', () => {
    const ledger = new UsageLedger(), identity = keyIdentity('first');
    ledger.record(identity, { provider: 'openai', model: raw.model, usage: parseUsage('openai', raw), at });
    ledger.record(identity, { provider: 'openai', model: 'unknown', usage: parseUsage('openai', raw), at });
    ledger.record(identity, { provider: 'openai', model: raw.model, usage: null, at });
    expect(ledger.summary('openai', identity)).toMatchObject({ requests: 3, unpricedRequests: 1, unconfirmedRequests: 1, inputTokens: 2000 });
    expect(ledger.summary('openai', keyIdentity('second'))).toEqual(emptyUsage());
    expect(ledger.summary('google', identity)).toEqual(emptyUsage());
    expect(ledger.summary('openai', '')).toEqual(emptyUsage());
  });
  it('persists totals across restart without any key or chat text', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mscw-usage-')); directories.push(directory);
    const path = join(directory, 'usage.json'), store = new UsageStore(path), identity = keyIdentity(input.apiKey);
    await store.load();
    await Promise.all(Array.from({ length: 3 }, () => store.record(identity, { provider: 'openai', model: raw.model, usage: parseUsage('openai', raw), at })));
    const text = await readFile(path, 'utf8'); expect(text).not.toContain(input.apiKey); expect(text).not.toContain(input.text); expect(text).not.toContain('Hello');
    const restored = new UsageStore(path); await restored.load();
    expect(restored.warning).toBeNull(); expect(restored.ledger.summary('openai', identity).requests).toBe(3);
    expect(restored.ledger.summary('openai', identity).estimatedUsd).toBeCloseTo(0.002895, 12);
  });
  it('preserves a corrupt file and exposes incomplete history instead of overwriting it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mscw-usage-')); directories.push(directory);
    const path = join(directory, 'usage.json'); await writeFile(path, '{broken');
    const store = new UsageStore(path); await store.load(); await store.record(keyIdentity('key'), { provider: 'openai', model: raw.model, usage: parseUsage('openai', raw), at });
    expect(store.warning).toContain('기존 파일'); expect(await readFile(path, 'utf8')).toBe('{broken');
  });
});
