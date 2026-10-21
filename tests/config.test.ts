import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigStore, validateSettingsPatch } from '../electron/core/config';

const directories: string[] = [];
const fakeCrypto = { available: () => true, encrypt: (v: string) => Buffer.from(`test-encrypted:${v}`).toString('base64'), decrypt: (v: string) => Buffer.from(v, 'base64').toString().replace(/^test-encrypted:/, '') };
async function setup() { const directory = await mkdtemp(join(tmpdir(), 'mscw-config-')); directories.push(directory); return { path: join(directory, 'config.json'), directory }; }
afterEach(async () => { await Promise.all(directories.splice(0).map(d => rm(d, { recursive: true, force: true }))); });

describe('configuration and credentials', () => {
  it('uses safe defaults on first launch', async () => { const { path } = await setup(); const store = new ConfigStore(path, fakeCrypto); await store.load(); expect(store.settings.glossaryEnabled).toBe(true); expect(store.keyStatus().openai).toBe(false); });
  it('persists only encrypted keys and reloads provider settings', async () => {
    const { path } = await setup(); const store = new ConfigStore(path, fakeCrypto);
    await store.saveProfile({ provider: 'openai', model: 'gpt-4.1-mini', endpoint: '', localApi: 'openai', apiKey: 'private-test-key' });
    expect(await readFile(path, 'utf8')).not.toContain('private-test-key');
    const loaded = new ConfigStore(path, fakeCrypto); await loaded.load();
    expect(loaded.getKey('openai')).toBe('private-test-key'); expect(loaded.keyStatus().openai).toBe(true);
    expect(JSON.stringify(loaded.settings)).not.toContain('private-test-key');
  });
  it('refuses plaintext fallback if OS encryption is unavailable', async () => {
    const { path } = await setup(); const store = new ConfigStore(path, { ...fakeCrypto, available: () => false });
    await expect(store.saveProfile({ provider: 'google', model: 'gemini-3.8-flash', endpoint: '', localApi: 'openai', apiKey: 'private-test-key' })).rejects.toThrow('암호화');
    expect(store.keyStatus().google).toBe(false);
  });
  it('keeps an existing key on blank input and deletes it only explicitly', async () => {
    const { path } = await setup(); const store = new ConfigStore(path, fakeCrypto);
    const input = { provider: 'openai' as const, model: 'gpt-4.1-mini', endpoint: '', localApi: 'openai' as const };
    await store.saveProfile({ ...input, apiKey: 'keep-key' }); await store.saveProfile({ ...input, apiKey: '' });
    expect(store.getKey('openai')).toBe('keep-key'); await store.saveProfile({ ...input, removeKey: true }); expect(store.keyStatus().openai).toBe(false);
  });
  it('serializes simultaneous settings writes without losing fields', async () => {
    const { path } = await setup(); const store = new ConfigStore(path, fakeCrypto);
    await Promise.all([store.updateSettings({ direction: 'en-ko' }), store.updateSettings({ autoCopy: false }), store.updateSettings({ glossaryEnabled: false })]);
    const loaded = new ConfigStore(path, fakeCrypto); await loaded.load(); expect(loaded.settings).toMatchObject({ direction: 'en-ko', autoCopy: false, glossaryEnabled: false });
  });
  it('handles malformed config without silently claiming existing keys are usable', async () => {
    const { path } = await setup(); await writeFile(path, '{broken'); const store = new ConfigStore(path, fakeCrypto); await store.load(); expect(store.warning).toContain('기본 설정'); expect(store.keyStatus().openai).toBe(false); expect(await readFile(path, 'utf8')).toBe('{broken');
  });
  it('validates IPC booleans and directions instead of trusting renderer input', () => {
    expect(() => validateSettingsPatch({ autoCopy: 'true' })).toThrow(); expect(() => validateSettingsPatch({ direction: 'random' })).toThrow(); expect(() => validateSettingsPatch({ provider: 'malicious' })).toThrow(); expect(validateSettingsPatch({ provider: 'openai', injected: 'ignore' })).toEqual({ provider: 'openai' });
  });
});
