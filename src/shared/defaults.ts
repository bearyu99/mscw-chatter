import type { ProviderId, Settings } from './types';

export const PROVIDERS: { id: ProviderId; name: string; short: string; description: string; models: string[] }[] = [
  { id: 'openai', name: 'OpenAI', short: 'O', description: 'GPT 모델로 간결하고 자연스럽게', models: ['gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-5-mini'] },
  { id: 'anthropic', name: 'Anthropic', short: 'A', description: 'Claude로 문맥을 섬세하게', models: ['claude-haiku-4-5', 'claude-sonnet-4-6'] },
  { id: 'google', name: 'Google', short: 'G', description: 'Gemini로 가볍고 빠르게', models: ['gemini-3.8-flash', 'gemini-2.5-flash'] },
  { id: 'local', name: '로컬 모델', short: 'L', description: '내 컴퓨터의 모델과 연결', models: ['qwen3:8b', 'gemma3:4b'] },
];
export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai', direction: 'auto', glossaryEnabled: true, autoCopy: true,
  alwaysOnTop: false, closeToTray: true, miniMode: false,
  profiles: {
    openai: { model: 'gpt-4.1-mini', endpoint: '', localApi: 'openai' },
    anthropic: { model: 'claude-haiku-4-5', endpoint: '', localApi: 'openai' },
    google: { model: 'gemini-3.8-flash', endpoint: '', localApi: 'openai' },
    local: { model: 'qwen3:8b', endpoint: 'http://127.0.0.1:11434', localApi: 'ollama' },
  },
};
export const MAX_INPUT_LENGTH = 2000;
export const GLOSSARY_URL = 'https://gall.dcinside.com/mgallery/board/view/?id=mapleclassic&no=4152';
export const emptyRuntime = () => ({ monitoring: false, phase: 'idle' as const, error: null, notice: null, pendingText: null, history: [] });
