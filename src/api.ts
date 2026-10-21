import { DEFAULT_SETTINGS, emptyRuntime } from './shared/defaults';
import type { AppApi, Snapshot } from './shared/types';

// A browser can preview the UI but cannot monitor a system clipboard in the background.
// This adapter never calls a paid API or stores API keys in a browser.
let preview: Snapshot = {
  settings: structuredClone(DEFAULT_SETTINGS), runtime: emptyRuntime(),
  keys: { openai: false, anthropic: false, google: false, local: false },
  platform: navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'win32',
  version: '0.1.0', shortcutAvailable: false, native: false, storageWarning: null,
};
const subscribers = new Set<(snapshot: Snapshot) => void>();
const publish = () => { for (const cb of subscribers) cb(structuredClone(preview)); return structuredClone(preview); };
const desktopOnly = async (): Promise<never> => { throw new Error('이 기능은 데스크톱 앱에서 사용할 수 있어요. 터미널에서 npm run dev로 앱을 실행해 주세요.'); };
const previewApi: AppApi = {
  getSnapshot: async () => structuredClone(preview),
  updateSettings: async patch => { preview = { ...preview, settings: { ...preview.settings, ...patch } }; return publish(); },
  saveProfile: desktopOnly,
  testConnection: desktopOnly,
  setMonitoring: desktopOnly,
  translate: desktopOnly,
  cancelTranslation: async () => {},
  copyEntry: desktopOnly,
  clearHistory: async () => { preview.runtime.history = []; publish(); },
  openExternal: async target => {
    const urls = { glossary: 'https://gall.dcinside.com/mgallery/board/view/?id=mapleclassic&no=4152', openai: 'https://platform.openai.com/api-keys', anthropic: 'https://platform.claude.com/settings/keys', google: 'https://aistudio.google.com/apikey', ollama: 'https://ollama.com/download' };
    window.open(urls[target], '_blank', 'noopener,noreferrer');
  },
  onSnapshot: cb => { subscribers.add(cb); return () => { subscribers.delete(cb); }; },
};
export const api = window.mscw ?? previewApi;
