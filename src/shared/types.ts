export type ProviderId = 'openai' | 'anthropic' | 'google' | 'local';
export type Direction = 'auto' | 'ko-en' | 'en-ko';
export type ResolvedDirection = Exclude<Direction, 'auto'>;
export type LocalApi = 'ollama' | 'openai';
export type Page = 'translator' | 'glossary' | 'settings';

export interface ProviderProfile { model: string; endpoint: string; localApi: LocalApi }
export interface Settings {
  provider: ProviderId;
  direction: Direction;
  glossaryEnabled: boolean;
  autoCopy: boolean;
  alwaysOnTop: boolean;
  closeToTray: boolean;
  miniMode: boolean;
  profiles: Record<ProviderId, ProviderProfile>;
}
export interface ProfileInput extends ProviderProfile { provider: ProviderId; apiKey?: string; removeKey?: boolean }
export interface TranslationEntry {
  id: string; original: string; translated: string; direction: ResolvedDirection;
  provider: ProviderId; model: string; durationMs: number; createdAt: number;
  glossaryTerms: string[]; copied: boolean; source: 'clipboard' | 'manual';
}
export interface RuntimeState {
  monitoring: boolean;
  phase: 'idle' | 'watching' | 'translating' | 'error';
  error: string | null;
  notice: string | null;
  pendingText: string | null;
  history: TranslationEntry[];
}
export interface Snapshot {
  settings: Settings; runtime: RuntimeState; keys: Record<ProviderId, boolean>;
  platform: string; version: string; shortcutAvailable: boolean; native: boolean;
  storageWarning: string | null;
}
export type SettingsPatch = Partial<Omit<Settings, 'profiles'>>;
export interface AppApi {
  getSnapshot(): Promise<Snapshot>;
  updateSettings(patch: SettingsPatch): Promise<Snapshot>;
  saveProfile(input: ProfileInput): Promise<Snapshot>;
  testConnection(input: ProfileInput): Promise<{ message: string }>;
  setMonitoring(enabled: boolean): Promise<Snapshot>;
  translate(text: string): Promise<void>;
  cancelTranslation(): Promise<void>;
  copyEntry(id: string, original?: boolean): Promise<void>;
  clearHistory(): Promise<void>;
  openExternal(target: 'glossary' | 'openai' | 'anthropic' | 'google' | 'ollama'): Promise<void>;
  onSnapshot(callback: (snapshot: Snapshot) => void): () => void;
}
declare global { interface Window { mscw?: AppApi } }
