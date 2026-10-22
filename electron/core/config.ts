import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEFAULT_SETTINGS } from '../../src/shared/defaults';
import type { ProfileInput, ProviderId, Settings, SettingsPatch } from '../../src/shared/types';
import { isProvider, validateProfile } from './providers';
import { validateShortcut, validateShortcutPair } from '../../src/shared/shortcuts';

interface StoredConfig { version: 1; settings: Settings; encryptedKeys: Partial<Record<ProviderId, string>> }
export interface CryptoPort { available(): boolean; encrypt(text: string): string; decrypt(text: string): string }
export class ConfigStore {
  private data: StoredConfig = { version: 1, settings: structuredClone(DEFAULT_SETTINGS), encryptedKeys: {} };
  warning: string | null = null;
  private queue = Promise.resolve();
  constructor(private path: string, private crypto: CryptoPort) {}
  get settings() { return structuredClone(this.data.settings); }
  async load() {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as StoredConfig;
      if (raw.version !== 1 || !raw.settings || !raw.encryptedKeys) throw new Error('invalid');
      const settings = structuredClone(DEFAULT_SETTINGS);
      const checked = validateSettingsPatch(raw.settings);
      Object.assign(settings, checked);
      validateShortcutPair(settings, process.platform);
      for (const provider of ['openai', 'anthropic', 'google', 'local'] as const) {
        const value = raw.settings.profiles?.[provider];
        if (value) settings.profiles[provider] = validateProfile({ ...value, provider });
      }
      const encryptedKeys: StoredConfig['encryptedKeys'] = {};
      for (const provider of ['openai', 'anthropic', 'google', 'local'] as const) {
        const value = raw.encryptedKeys[provider];
        if (typeof value === 'string' && value.length < 50000) encryptedKeys[provider] = value;
      }
      this.data = { version: 1, settings, encryptedKeys };
      for (const provider of Object.keys(encryptedKeys) as ProviderId[]) this.getKey(provider);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.warning = '저장된 설정을 읽지 못해 기본 설정을 불러왔어요. API 키와 모델 설정을 다시 확인해 주세요.';
    }
  }
  getKey(provider: ProviderId) {
    const encrypted = this.data.encryptedKeys[provider];
    if (!encrypted) return '';
    try { return this.crypto.decrypt(encrypted); }
    catch { this.warning = '저장된 API 키를 복호화하지 못했어요. 설정에서 키를 다시 저장해 주세요.'; return ''; }
  }
  keyStatus(): Record<ProviderId, boolean> {
    return { openai: !!this.getKey('openai'), anthropic: !!this.getKey('anthropic'), google: !!this.getKey('google'), local: !!this.getKey('local') };
  }
  async updateSettings(patch: SettingsPatch) {
    const valid = validateSettingsPatch(patch);
    return this.mutate(next => { Object.assign(next.settings, valid); validateShortcutPair(next.settings, process.platform); });
  }
  async saveProfile(input: ProfileInput) {
    const profile = validateProfile(input);
    if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 4096 || /[\r\n\0]/.test(input.apiKey))) throw new Error('API 키 형식을 확인해 주세요.');
    if (input.apiKey?.trim() && !this.crypto.available()) throw new Error('OS 암호화 저장소를 사용할 수 없어요. 시스템 키체인 상태를 확인해 주세요. 키는 저장하지 않았어요.');
    const encrypted = input.apiKey?.trim() ? this.crypto.encrypt(input.apiKey.trim()) : undefined;
    return this.mutate(next => {
      next.settings.provider = input.provider;
      next.settings.profiles[input.provider] = profile;
      if (input.removeKey) delete next.encryptedKeys[input.provider];
      else if (encrypted) next.encryptedKeys[input.provider] = encrypted;
    });
  }
  private async mutate(apply: (next: StoredConfig) => void) {
    const pending = this.queue.then(async () => {
      const next = structuredClone(this.data);
      apply(next);
      await mkdir(dirname(this.path), { recursive: true });
      const temp = `${this.path}.tmp`;
      try { await writeFile(temp, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 }); await rename(temp, this.path); }
      catch { throw new Error('설정을 저장하지 못했어요. 디스크 여유 공간과 폴더 권한을 확인해 주세요.'); }
      this.data = next;
      this.warning = null;
    });
    this.queue = pending.catch(() => {});
    return pending;
  }
}
export function validateSettingsPatch(value: unknown): SettingsPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('설정 형식이 올바르지 않아요.');
  const raw = value as Record<string, unknown>;
  const valid: SettingsPatch = {};
  for (const key of ['monitorShortcut', 'translateShortcut'] as const) if (key in raw) valid[key] = validateShortcut(raw[key]);
  if ('provider' in raw) { if (!isProvider(raw.provider)) throw new Error('제공자를 확인해 주세요.'); valid.provider = raw.provider; }
  if ('direction' in raw) { if (!['auto', 'ko-en', 'en-ko'].includes(String(raw.direction))) throw new Error('번역 방향을 확인해 주세요.'); valid.direction = raw.direction as Settings['direction']; }
  for (const key of ['glossaryEnabled', 'autoCopy', 'alwaysOnTop', 'closeToTray', 'miniMode'] as const) {
    if (key in raw) { if (typeof raw[key] !== 'boolean') throw new Error('설정값이 올바르지 않아요.'); valid[key] = raw[key]; }
  }
  return valid;
}
