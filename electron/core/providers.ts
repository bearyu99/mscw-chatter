import type { ProfileInput, ProviderId, ProviderProfile, ResolvedDirection } from '../../src/shared/types';
import { buildPrompt } from './prompt';
import { parseUsage, type UsageEvent } from '../../src/shared/usage';

export interface TranslationRequest {
  text: string; direction: ResolvedDirection; provider: ProviderId; profile: ProviderProfile;
  apiKey: string; glossaryEnabled: boolean; signal: AbortSignal;
}
export interface ProviderResult { text: string; terms: string[] }
export type Fetcher = typeof fetch;
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const isProvider = (value: unknown): value is ProviderId => ['openai', 'anthropic', 'google', 'local'].includes(String(value));

export function validateProfile(input: ProfileInput): ProviderProfile {
  if (!isProvider(input?.provider)) throw new Error('올바른 AI 제공자를 선택해 주세요.');
  if (typeof input.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/@-]{0,159}$/.test(input.model.trim())) throw new Error('모델 ID를 확인해 주세요. 공백 없이 입력해야 해요.');
  if (!['ollama', 'openai'].includes(input.localApi)) throw new Error('로컬 API 형식을 선택해 주세요.');
  const profile = { model: input.model.trim(), endpoint: '', localApi: input.localApi };
  if (input.provider === 'local') {
    let url: URL;
    try { url = new URL(input.endpoint); } catch { throw new Error('로컬 서버 주소를 확인해 주세요. 예: http://127.0.0.1:11434'); }
    if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) {
      throw new Error('로컬 모델은 localhost, 127.0.0.1 또는 [::1] 주소만 연결할 수 있어요.');
    }
    if (url.pathname.length > 160) throw new Error('로컬 서버의 기본 주소를 입력해 주세요.');
    profile.endpoint = url.href.replace(/\/+$/, '');
  }
  return profile;
}

export function buildRequest(provider: ProviderId, profile: ProviderProfile, apiKey: string, system: string, user: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let url: string;
  let body: Record<string, unknown>;
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  switch (provider) {
    case 'anthropic':
      url = 'https://api.anthropic.com/v1/messages';
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      body = { model: profile.model, max_tokens: 2048, system, messages: [{ role: 'user', content: user }], stream: false };
      if (profile.model === 'claude-haiku-5-5') { body.output_config = { effort: 'low' }; body.thinking = { type: 'disabled' }; }
      break;
    case 'google':
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(profile.model)}:generateContent`;
      headers['x-goog-api-key'] = apiKey;
      body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { maxOutputTokens: 4096 } };
      break;
    case 'local': {
      const base = profile.endpoint.replace(/\/+$/, '');
      if (profile.localApi === 'ollama') {
        url = `${base}/api/chat`;
        body = { model: profile.model, messages, stream: false, think: false, options: { temperature: 0.2, num_predict: 2048 }, keep_alive: '10m' };
      } else {
        url = `${base}${base.endsWith('/v1') ? '' : '/v1'}/chat/completions`;
        body = { model: profile.model, messages, stream: false, max_tokens: 2048 };
      }
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      break;
    }
    default:
      url = 'https://api.openai.com/v1/chat/completions';
      headers.Authorization = `Bearer ${apiKey}`;
      body = { model: profile.model, messages, stream: false, max_completion_tokens: 2048, store: false, service_tier: 'default' };
      if (profile.model === 'gpt-6-luna') body.reasoning_effort = 'none';
  }
  return { url, headers, body };
}

export function parseResponse(provider: ProviderId, localApi: ProviderProfile['localApi'], value: unknown): string {
  const data = record(value);
  let text: unknown;
  let finish: unknown;
  if (provider === 'anthropic') {
    finish = data.stop_reason;
    text = array(data.content).filter(p => record(p).type === 'text').map(p => record(p).text).filter(t => typeof t === 'string').join('');
  } else if (provider === 'google') {
    const candidate = record(array(data.candidates)[0]);
    finish = candidate.finishReason;
    text = array(record(candidate.content).parts).filter(p => record(p).thought !== true).map(p => record(p).text).filter(t => typeof t === 'string').join('');
  } else if (provider === 'local' && localApi === 'ollama') {
    finish = data.done_reason;
    if (data.done !== true) throw new Error('로컬 모델이 번역을 완료하지 못했어요. 다시 시도해 주세요.');
    text = record(data.message).content;
  } else {
    const choice = record(array(data.choices)[0]);
    finish = choice.finish_reason;
    text = record(choice.message).content;
  }
  if (['length', 'max_tokens', 'MAX_TOKENS'].includes(String(finish))) throw new Error('번역이 길이 제한으로 잘렸어요. 문장을 나눠서 번역해 주세요.');
  if (['content_filter', 'SAFETY', 'RECITATION', 'refusal'].includes(String(finish))) throw new Error('모델이 이 문장을 번역하지 못했어요. 내용을 바꾸거나 다른 모델을 선택해 주세요.');
  if (typeof text !== 'string' || !text.trim()) throw new Error('모델이 빈 응답을 보냈어요. 모델 ID와 연결 상태를 확인해 주세요.');
  // Some local models emit thinking tags despite think:false. Never copy that internal block.
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!cleaned || cleaned.length > 12000 || cleaned.includes('<think>')) throw new Error('사용할 수 없는 번역 응답이에요. 다른 모델로 시도해 주세요.');
  return cleaned;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('번역 서버에서 응답이 없어요.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 1_048_576) { await reader.cancel(); throw new Error('번역 서버의 응답이 너무 커요.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('서버 응답 형식이 올바르지 않아요. API 형식과 주소를 확인해 주세요.'); }
}

export async function translateWithProvider(input: TranslationRequest, fetcher: Fetcher = fetch, onUsage?: (event: UsageEvent) => void | Promise<void>): Promise<ProviderResult> {
  if (input.provider !== 'local' && !input.apiKey) throw new Error('설정에서 선택한 제공자의 API 키를 먼저 저장해 주세요.');
  const prompt = buildPrompt(input.text, input.direction, input.glossaryEnabled);
  const profile = validateProfile({ ...input.profile, provider: input.provider });
  const request = buildRequest(input.provider, profile, input.apiKey, prompt.system, prompt.user);
  const timeout = AbortSignal.timeout(input.provider === 'local' ? 60000 : 25000);
  const signal = AbortSignal.any([input.signal, timeout]);
  let reported = false;
  const report = async (data: unknown) => {
    reported = true;
    if (input.provider === 'local' || !onUsage) return;
    const responseModel = record(data)[input.provider === 'google' ? 'modelVersion' : 'model'];
    await onUsage({ provider: input.provider, model: typeof responseModel === 'string' ? responseModel : profile.model, usage: parseUsage(input.provider, data), at: Date.now() });
  };
  signal.throwIfAborted();
  try {
    const response = await fetcher(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), redirect: 'error', signal });
    if (!response.ok) {
      // Rejected requests have no token usage; network/5xx ambiguity is recorded separately.
      if (response.status < 500) reported = true;
      await response.body?.cancel();
      if ([401, 403].includes(response.status)) throw new Error('API 키 또는 모델 접근 권한을 확인해 주세요.');
      if (response.status === 429) throw new Error('API 사용량 또는 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.');
      if (response.status === 404) throw new Error('모델을 찾을 수 없어요. 모델 ID와 서버 주소를 확인해 주세요.');
      if (response.status === 400 || response.status === 422) throw new Error('모델이 요청 형식을 지원하지 않아요. 모델 ID와 API 형식을 확인해 주세요.');
      throw new Error(`번역 서버에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요. (${response.status})`);
    }
    const data = await readJson(response);
    // Count returned usage even if text is truncated, refused, or canceled immediately afterwards.
    await report(data);
    signal.throwIfAborted();
    return { text: parseResponse(input.provider, profile.localApi, data), terms: prompt.terms };
  } catch (error) {
    if (input.signal.aborted) throw new DOMException('번역이 취소되었어요.', 'AbortError');
    if (timeout.aborted) throw new Error('번역 시간이 초과되었어요. 연결 상태를 확인하거나 더 작은 모델을 선택해 주세요.');
    if (error instanceof TypeError || (error instanceof Error && /fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(error.message))) {
      throw new Error(input.provider === 'local' ? '로컬 서버에 연결할 수 없어요. 서버 실행 여부와 주소를 확인해 주세요.' : '번역 서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.');
    }
    throw error;
  } finally { if (!reported) await report(null); }
}
