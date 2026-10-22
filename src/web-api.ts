import { TranslationController } from '../electron/core/controller';
import { isProvider, translateWithProvider, validateProfile, type Fetcher } from '../electron/core/providers';
import { DEFAULT_SETTINGS } from './shared/defaults';
import { validateShortcut, validateShortcutPair } from './shared/shortcuts';
import { EXTERNAL_URLS, UsageLedger } from './shared/usage';
import type { AppApi, ProfileInput, ProviderId, SettingsPatch, Snapshot } from './shared/types';

interface Options {
  version: string;
  fetcher?: Fetcher;
  clipboard?: { writeText(text: string): Promise<void> };
}
const cloudOrigins = new Set(['https://api.openai.com', 'https://api.anthropic.com', 'https://generativelanguage.googleapis.com']);

export function createWebApi({ version, fetcher = fetch, clipboard }: Options): AppApi {
  const settings = { ...structuredClone(DEFAULT_SETTINGS), autoCopy: false, alwaysOnTop: false, closeToTray: false };
  // Secrets, settings and chat history are scoped to this page instance, never web storage.
  const keys = new Map<ProviderId, string>();
  const identities = new Map<ProviderId, string>();
  const ledger = new UsageLedger();
  let pageActive = true;
  let pageEpoch = 0;
  const identity = async (key: string) => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))).map(byte => byte.toString(16).padStart(2, '0')).join('');
  const subscribers = new Set<(snapshot: Snapshot) => void>();
  const snapshot = (): Snapshot => structuredClone({
    settings, runtime: controller.state,
    keys: { openai: !!keys.get('openai'), anthropic: !!keys.get('anthropic'), google: !!keys.get('google'), local: false },
    native: false, platform: typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform) ? 'darwin' : 'win32',
    version, shortcutAvailable: false, storageWarning: null,
    usage: Object.fromEntries((['openai', 'anthropic', 'google', 'local'] as const).map(provider => [provider, ledger.summary(provider, identities.get(provider) ?? '')])) as Snapshot['usage'], usageWarning: null,
  });
  const emit = () => { for (const callback of subscribers) callback(snapshot()); };
  const browserFetch: Fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (!cloudOrigins.has(url.origin)) throw new Error('웹에서는 공식 클라우드 API만 연결할 수 있어요.');
    const headers = new Headers(init?.headers);
    if (url.origin === 'https://api.anthropic.com') headers.set('anthropic-dangerous-direct-browser-access', 'true');
    try { return await fetcher(input, { ...init, headers, credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer' }); }
    catch (error) {
      if (error instanceof TypeError) throw new Error('브라우저에서 번역 서버에 연결하지 못했어요. 인터넷 연결과 제공자의 브라우저 접근 허용 여부를 확인해 주세요.');
      throw error;
    }
  };
  const controller = new TranslationController({
    // Paste events supply text explicitly. Never ask for system clipboard read access.
    clipboard: {
      readText: async () => '',
      writeText: async text => {
        try {
          const target = clipboard ?? (typeof navigator !== 'undefined' ? navigator.clipboard : undefined);
          if (!target?.writeText) throw new Error('unavailable');
          await target.writeText(text);
        } catch { throw new Error('복사 권한이 없어요. 번역 결과를 선택해 직접 복사해 주세요.'); }
      },
    },
    settings: () => settings, getKey: provider => keys.get(provider) ?? '',
    translate: trackedTranslate, onChange: emit,
  });
  async function trackedTranslate(request: Parameters<typeof translateWithProvider>[0]) {
    const epoch = pageEpoch;
    const account = await identity(request.apiKey);
    if (!pageActive || epoch !== pageEpoch) throw new DOMException('페이지를 떠나 요청이 취소되었어요.', 'AbortError');
    return translateWithProvider(request, browserFetch, event => { ledger.record(account, event); emit(); });
  }
  function checkedProfile(input: ProfileInput) {
    if (input.provider === 'local') throw new Error('로컬 모델은 데스크톱 앱에서 사용할 수 있어요.');
    if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 4096 || /[\r\n\0]/.test(input.apiKey))) throw new Error('API 키 형식을 확인해 주세요.');
    return validateProfile(input);
  }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => {
    pageActive = false;
    pageEpoch++;
    keys.clear(); identities.clear(); void controller.setMonitoring(false);
  });
  if (typeof window !== 'undefined') window.addEventListener('pageshow', () => { pageActive = true; });
  return {
    getSnapshot: async () => snapshot(),
    onSnapshot: callback => { subscribers.add(callback); return () => { subscribers.delete(callback); }; },
    updateSettings: async patch => {
      const valid: SettingsPatch = {};
      for (const key of ['monitorShortcut', 'translateShortcut'] as const) {
        if (patch[key] !== undefined) valid[key] = validateShortcut(patch[key]);
      }
      validateShortcutPair({ ...settings, ...valid }, snapshot().platform);
      if (patch.provider !== undefined) {
        if (!isProvider(patch.provider)) throw new Error('AI 제공자를 확인해 주세요.');
        if (patch.provider === 'local') throw new Error('로컬 모델은 데스크톱 앱에서 사용할 수 있어요.');
        if (patch.provider !== settings.provider && !keys.get(patch.provider)) throw new Error('설정에서 이 제공자의 API 키를 먼저 연결해 주세요.');
        valid.provider = patch.provider;
      }
      if (patch.direction !== undefined) {
        if (!['auto', 'ko-en', 'en-ko'].includes(patch.direction)) throw new Error('번역 방향을 확인해 주세요.');
        valid.direction = patch.direction;
      }
      for (const key of ['glossaryEnabled', 'miniMode', 'autoCopy', 'alwaysOnTop', 'closeToTray'] as const) {
        if (patch[key] === undefined) continue;
        if (typeof patch[key] !== 'boolean') throw new Error('설정값을 확인해 주세요.');
        if (['autoCopy', 'alwaysOnTop', 'closeToTray'].includes(key) && patch[key]) throw new Error('웹에서는 결과를 직접 복사하며, 창과 트레이 기능은 데스크톱 앱에서 지원해요.');
        valid[key] = patch[key];
      }
      if (valid.provider && valid.provider !== settings.provider) await controller.setMonitoring(false);
      Object.assign(settings, valid); emit(); return snapshot();
    },
    saveProfile: async input => {
      const epoch = pageEpoch;
      const profile = checkedProfile(input);
      const newKey = input.apiKey?.trim();
      const account = newKey && !input.removeKey ? await identity(newKey) : '';
      if (!pageActive || epoch !== pageEpoch) throw new Error('페이지를 다시 열고 API 키를 연결해 주세요.');
      await controller.setMonitoring(false);
      if (!pageActive || epoch !== pageEpoch) throw new Error('페이지를 다시 열고 API 키를 연결해 주세요.');
      settings.provider = input.provider; settings.profiles[input.provider] = profile;
      if (input.removeKey) { keys.delete(input.provider); identities.delete(input.provider); }
      else if (newKey) { keys.set(input.provider, newKey); identities.set(input.provider, account); }
      emit(); return snapshot();
    },
    testConnection: async input => {
      const profile = checkedProfile(input);
      await trackedTranslate({ provider: input.provider, profile, apiKey: input.apiKey?.trim() || keys.get(input.provider) || '',
        text: '안녕하세요', direction: 'ko-en', glossaryEnabled: false, signal: new AbortController().signal });
      return { message: '브라우저에서 AI 연결과 번역 응답을 확인했어요.' };
    },
    setMonitoring: async enabled => { await controller.setMonitoring(enabled); return snapshot(); },
    translate: text => controller.submit(text, controller.state.monitoring ? 'clipboard' : 'manual'),
    cancelTranslation: async () => controller.cancel(),
    copyEntry: (id, original) => controller.copyEntry(id, original),
    clearHistory: async () => controller.clearHistory(),
    openExternal: async target => {
      if (!Object.hasOwn(EXTERNAL_URLS, target)) throw new Error('허용되지 않은 링크예요.');
      window.open(EXTERNAL_URLS[target], '_blank', 'noopener,noreferrer');
    },
  };
}
