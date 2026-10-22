import { TranslationController } from '../electron/core/controller';
import { isProvider, translateWithProvider, validateProfile, type Fetcher } from '../electron/core/providers';
import { DEFAULT_SETTINGS } from './shared/defaults';
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
  const subscribers = new Set<(snapshot: Snapshot) => void>();
  const snapshot = (): Snapshot => structuredClone({
    settings, runtime: controller.state,
    keys: { openai: !!keys.get('openai'), anthropic: !!keys.get('anthropic'), google: !!keys.get('google'), local: false },
    native: false, platform: typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform) ? 'darwin' : 'win32',
    version, shortcutAvailable: false, storageWarning: null,
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
    translate: request => translateWithProvider(request, browserFetch), onChange: emit,
  });
  function checkedProfile(input: ProfileInput) {
    if (input.provider === 'local') throw new Error('로컬 모델은 데스크톱 앱에서 사용할 수 있어요.');
    if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 4096 || /[\r\n\0]/.test(input.apiKey))) throw new Error('API 키 형식을 확인해 주세요.');
    return validateProfile(input);
  }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => {
    keys.clear(); void controller.setMonitoring(false);
  });
  return {
    getSnapshot: async () => snapshot(),
    onSnapshot: callback => { subscribers.add(callback); return () => { subscribers.delete(callback); }; },
    updateSettings: async patch => {
      const valid: SettingsPatch = {};
      if (patch.provider !== undefined) {
        if (!isProvider(patch.provider)) throw new Error('AI 제공자를 확인해 주세요.');
        if (patch.provider === 'local') throw new Error('로컬 모델은 데스크톱 앱에서 사용할 수 있어요.');
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
      const profile = checkedProfile(input);
      await controller.setMonitoring(false);
      settings.provider = input.provider; settings.profiles[input.provider] = profile;
      if (input.removeKey) keys.delete(input.provider);
      else if (input.apiKey?.trim()) keys.set(input.provider, input.apiKey.trim());
      emit(); return snapshot();
    },
    testConnection: async input => {
      const profile = checkedProfile(input);
      await translateWithProvider({ provider: input.provider, profile, apiKey: input.apiKey?.trim() || keys.get(input.provider) || '',
        text: '안녕하세요', direction: 'ko-en', glossaryEnabled: false, signal: new AbortController().signal }, browserFetch);
      return { message: '브라우저에서 AI 연결과 번역 응답을 확인했어요.' };
    },
    setMonitoring: async enabled => { await controller.setMonitoring(enabled); return snapshot(); },
    translate: text => controller.submit(text, controller.state.monitoring ? 'clipboard' : 'manual'),
    cancelTranslation: async () => controller.cancel(),
    copyEntry: (id, original) => controller.copyEntry(id, original),
    clearHistory: async () => controller.clearHistory(),
    openExternal: async target => {
      const urls = { glossary: 'https://gall.dcinside.com/mgallery/board/view/?id=mapleclassic&no=4152', openai: 'https://platform.openai.com/api-keys', anthropic: 'https://platform.claude.com/settings/keys', google: 'https://aistudio.google.com/apikey', ollama: 'https://ollama.com/download' };
      window.open(urls[target], '_blank', 'noopener,noreferrer');
    },
  };
}
