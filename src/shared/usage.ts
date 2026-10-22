import type { ProviderId, UsageSummary } from './types';

export const PRICING_CHECKED_AT = '2026-10-22';
export const PRICING_SOURCES = {
  openai: 'https://developers.openai.com/api/docs/pricing',
  anthropic: 'https://platform.claude.com/docs/en/about-claude/pricing',
  google: 'https://ai.google.dev/gemini-api/docs/pricing',
};
export const EXTERNAL_URLS = {
  glossary: 'https://gall.dcinside.com/mgallery/board/view/?id=mapleclassic&no=4152',
  openai: 'https://platform.openai.com/api-keys', anthropic: 'https://platform.claude.com/settings/keys',
  google: 'https://aistudio.google.com/apikey', ollama: 'https://ollama.com/download',
  'billing-openai': 'https://platform.openai.com/usage',
  'billing-anthropic': 'https://platform.claude.com/cost',
  'billing-google': 'https://aistudio.google.com/billing',
};
export interface TokenUsage { inputTokens: number; outputTokens: number; cachedInputTokens: number; cacheWriteTokens: number; cacheWrite5mTokens: number; cacheWrite1hTokens: number }
export interface UsageEvent { provider: ProviderId; model: string; usage: TokenUsage | null; at: number }
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown, fallback = NaN): number => value === undefined ? fallback : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : NaN;
export const emptyUsage = (): UsageSummary => ({ startedAt: null, requests: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, estimatedUsd: 0, unpricedRequests: 0, unconfirmedRequests: 0 });

export function parseUsage(provider: ProviderId, value: unknown): TokenUsage | null {
  const data = object(value), raw = object(provider === 'google' ? data.usageMetadata : data.usage);
  let inputTokens: number, outputTokens: number, cachedInputTokens = 0, cacheWriteTokens = 0, cacheWrite5mTokens = 0, cacheWrite1hTokens = 0;
  if (provider === 'openai') {
    inputTokens = count(raw.prompt_tokens); outputTokens = count(raw.completion_tokens);
    cachedInputTokens = count(object(raw.prompt_tokens_details).cached_tokens, 0);
    cacheWriteTokens = count(object(raw.prompt_tokens_details).cache_write_tokens, 0);
    // completion_tokens already includes reasoning tokens.
  } else if (provider === 'anthropic') {
    cachedInputTokens = count(raw.cache_read_input_tokens, 0);
    const writes = count(raw.cache_creation_input_tokens, 0), details = object(raw.cache_creation);
    cacheWrite1hTokens = count(details.ephemeral_1h_input_tokens, 0);
    cacheWrite5mTokens = count(details.ephemeral_5m_input_tokens, writes - cacheWrite1hTokens);
    if (cacheWrite5mTokens + cacheWrite1hTokens !== writes) return null;
    inputTokens = count(raw.input_tokens) + cachedInputTokens + writes;
    outputTokens = count(raw.output_tokens);
  } else if (provider === 'google') {
    inputTokens = count(raw.promptTokenCount); cachedInputTokens = count(raw.cachedContentTokenCount, 0);
    outputTokens = count(raw.candidatesTokenCount) + count(raw.thoughtsTokenCount, 0);
  } else return null;
  const result = { inputTokens, outputTokens, cachedInputTokens, cacheWriteTokens, cacheWrite5mTokens, cacheWrite1hTokens };
  if (Object.values(result).some(v => !Number.isSafeInteger(v) || v < 0) || cachedInputTokens + cacheWriteTokens + cacheWrite5mTokens + cacheWrite1hTokens > inputTokens) return null;
  return result;
}

// USD per million tokens, standard text requests. Only verified model IDs are priced.
export function estimateUsd(provider: ProviderId, model: string, usage: TokenUsage, at: number): number | null {
  let rates: number[] | undefined;
  if (provider === 'openai') rates = ({
    'gpt-6-luna': usage.inputTokens > 272000 ? [0.2, 0.75, 0.02, 0, 0, 0.25] : [0.1, 0.5, 0.01, 0, 0, 0.125],
    'gpt-4.1-mini': [0.4, 1.6, 0.1], 'gpt-4.1-mini-2025-04-14': [0.4, 1.6, 0.1],
    'gpt-4.1-nano': [0.1, 0.4, 0.025], 'gpt-4.1-nano-2025-04-14': [0.1, 0.4, 0.025],
    'gpt-5-mini': [0.25, 2, 0.025], 'gpt-5-mini-2025-08-07': [0.25, 2, 0.025],
  } as Record<string, number[]>)[model];
  if (provider === 'anthropic') rates = ({
    'claude-haiku-5-5': usage.inputTokens > 100000 ? [0.5, 2.5, 0.05, 0.625, 1] : [0.1, 0.5, 0.01, 0.125, 0.2],
    'claude-haiku-4-5': [1, 5, 0.1, 1.25, 2], 'claude-haiku-4-5-20251001': [1, 5, 0.1, 1.25, 2],
    'claude-sonnet-4-6': [3, 15, 0.3, 3.75, 6],
  } as Record<string, number[]>)[model];
  if (provider === 'google' && model === 'gemini-3.8-flash') rates = at < Date.UTC(2027, 0, 1) ? [0.75, 3.75, 0.075] : [1.5, 7.5, 0.15];
  if (provider === 'google' && model === 'gemini-2.5-flash') rates = [0.3, 2.5, 0.03];
  if (provider === 'google' && model === 'gemini-3.5-flash-lite') rates = [0.3, 2.5, 0.03];
  if (provider === 'google' && model === 'gemini-2.5-flash-lite') rates = [0.1, 0.4, 0.01];
  if (!rates || (usage.cacheWrite5mTokens > 0 && rates[3] === undefined) || (usage.cacheWrite1hTokens > 0 && rates[4] === undefined) || (usage.cacheWriteTokens > 0 && rates[5] === undefined)) return null;
  return ((usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens - usage.cacheWrite5mTokens - usage.cacheWrite1hTokens) * rates[0] + usage.outputTokens * rates[1] + usage.cachedInputTokens * rates[2] + usage.cacheWriteTokens * (rates[5] ?? 0) + usage.cacheWrite5mTokens * (rates[3] ?? 0) + usage.cacheWrite1hTokens * (rates[4] ?? 0)) / 1_000_000;
}

export class UsageLedger {
  private accounts: Record<string, UsageSummary> = {};
  summary(provider: ProviderId, identity: string): UsageSummary { return structuredClone(identity ? this.accounts[`${provider}:${identity}`] ?? emptyUsage() : emptyUsage()); }
  record(identity: string, event: UsageEvent) {
    if (!identity || event.provider === 'local') return;
    const key = `${event.provider}:${identity}`, summary = this.accounts[key] ??= emptyUsage();
    summary.startedAt ??= event.at; summary.requests++;
    if (!event.usage) { summary.unconfirmedRequests++; return; }
    summary.inputTokens += event.usage.inputTokens; summary.outputTokens += event.usage.outputTokens; summary.cachedInputTokens += event.usage.cachedInputTokens;
    const cost = estimateUsd(event.provider, event.model, event.usage, event.at);
    if (cost === null) summary.unpricedRequests++; else summary.estimatedUsd += cost;
  }
  export() { return { version: 1 as const, accounts: structuredClone(this.accounts) }; }
  restore(value: unknown) {
    const data = object(value);
    if (data.version !== 1 || !data.accounts || typeof data.accounts !== 'object' || Array.isArray(data.accounts)) throw new Error('invalid usage');
    const accounts: Record<string, UsageSummary> = {};
    const fields = Object.keys(emptyUsage()).filter(k => k !== 'startedAt');
    for (const [key, raw] of Object.entries(object(data.accounts))) {
      const item = object(raw);
      if (!/^(openai|anthropic|google):[a-f0-9]{64}$/.test(key) || fields.some(field => typeof item[field] !== 'number' || !Number.isFinite(item[field]) || (item[field] as number) < 0 || (field !== 'estimatedUsd' && !Number.isSafeInteger(item[field]))) || (item.startedAt !== null && (!Number.isSafeInteger(item.startedAt) || (item.startedAt as number) < 0))) throw new Error('invalid usage');
      accounts[key] = Object.fromEntries(Object.keys(emptyUsage()).map(field => [field, item[field]])) as unknown as UsageSummary;
    }
    this.accounts = accounts;
  }
}
