import { describe, expect, it, vi } from 'vitest';
import { createWebApi } from '../src/web-api';
import { DEFAULT_SETTINGS } from '../src/shared/defaults';
import type { ProviderId } from '../src/shared/types';

const reply = (text = 'hello') => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: text } }] }));
const profile = (provider: ProviderId = 'openai', apiKey = 'fixture-key') => ({ ...DEFAULT_SETTINGS.profiles[provider], provider, apiKey });
function fixture(fetcher = vi.fn<typeof fetch>().mockImplementation(async () => reply())) {
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  return { api: createWebApi({ version: 'test', fetcher, clipboard }), clipboard, fetcher };
}
describe('browser translation', () => {
  it('keeps keys out of snapshots and clears them for a new tab instance', async () => {
    const { api } = fixture(); await api.saveProfile(profile());
    const snapshot = await api.getSnapshot();
    expect(snapshot.keys.openai).toBe(true); expect(JSON.stringify(snapshot)).not.toContain('fixture-key');
    expect((await fixture().api.getSnapshot()).keys.openai).toBe(false);
  });
  it('translates with the shared glossary prompt without reading or overwriting the clipboard', async () => {
    const { api, fetcher, clipboard } = fixture(); await api.saveProfile(profile()); await api.translate('홀심 주세요');
    const snapshot = await api.getSnapshot();
    expect(snapshot.runtime.history[0].translated).toBe('hello');
    expect(snapshot.runtime.history[0].glossaryTerms).toContain('HS');
    expect(fetcher.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(fetcher.mock.calls[0][1]?.credentials).toBe('omit');
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });
  it('copies only after an explicit copy action', async () => {
    const { api, clipboard } = fixture(); await api.saveProfile(profile()); await api.translate('안녕');
    await api.copyEntry((await api.getSnapshot()).runtime.history[0].id);
    expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith('hello');
  });
  it('retains the result when clipboard permission is denied', async () => {
    const { api, clipboard } = fixture(); await api.saveProfile(profile()); await api.translate('안녕');
    clipboard.writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    await expect(api.copyEntry((await api.getSnapshot()).runtime.history[0].id)).rejects.toThrow('복사');
    expect((await api.getSnapshot()).runtime.history[0].translated).toBe('hello');
  });
  it('does not request an API when a key is missing', async () => {
    const { api, fetcher } = fixture(); await expect(api.translate('안녕')).rejects.toThrow('API 키'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('supports removing a key and stops paste automation', async () => {
    const { api } = fixture(); await api.saveProfile(profile()); await api.setMonitoring(true);
    await api.saveProfile({ ...profile(), removeKey: true });
    const snapshot = await api.getSnapshot(); expect(snapshot.keys.openai).toBe(false); expect(snapshot.runtime.monitoring).toBe(false);
  });
  it('does not expose rejected credentials or server response bodies', async () => {
    const { api } = fixture(vi.fn<typeof fetch>().mockImplementation(async () => new Response('fixture-key', { status: 401 })));
    await api.saveProfile(profile()); await api.setMonitoring(true); await api.translate('안녕');
    const snapshot = await api.getSnapshot(); expect(snapshot.runtime.error).toContain('API 키');
    expect(snapshot.runtime.monitoring).toBe(false); expect(JSON.stringify(snapshot)).not.toContain('fixture-key');
  });
  it('does not add a connection test to chat history', async () => {
    const { api } = fixture(); await api.testConnection(profile()); expect((await api.getSnapshot()).runtime.history).toEqual([]);
  });
  it('rejects local servers and unsupported OS settings in the web adapter', async () => {
    const { api, fetcher } = fixture(); await expect(api.saveProfile(profile('local'))).rejects.toThrow('데스크톱');
    await expect(api.updateSettings({ autoCopy: true })).rejects.toThrow('직접');
    await expect(api.updateSettings({ provider: 'local' })).rejects.toThrow('데스크톱');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('validates key and model fields before mutating state', async () => {
    const { api } = fixture(); await expect(api.saveProfile(profile('openai', 'bad\nkey'))).rejects.toThrow('API 키');
    await expect(api.saveProfile({ ...profile(), model: 'invalid model' })).rejects.toThrow('모델 ID');
    expect((await api.getSnapshot()).keys.openai).toBe(false);
  });
  it('keeps mini mode and terminology toggles while translating', async () => {
    let finish!: (value: Response) => void;
    const { api } = fixture(vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { finish = resolve; })));
    await api.saveProfile(profile()); const pending = api.translate('안녕'); await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await api.updateSettings({ miniMode: true }); finish(reply()); await pending;
    expect((await api.getSnapshot()).settings.miniMode).toBe(true); expect((await api.getSnapshot()).runtime.history).toHaveLength(1);
  });
  it('ignores an old response after cancellation even if transport ignores the signal', async () => {
    let finish!: (value: Response) => void;
    const { api } = fixture(vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { finish = resolve; })));
    await api.saveProfile(profile()); const pending = api.translate('안녕'); await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await api.cancelTranslation(); finish(reply()); await pending;
    expect((await api.getSnapshot()).runtime.history).toEqual([]);
  });
  it.each([
    ['anthropic', { content: [{ type: 'text', text: 'hello' }], stop_reason: 'end_turn' }],
    ['google', { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'hello' }] } }] }],
  ] as const)('supports %s browser requests', async (provider, body) => {
    const { api, fetcher } = fixture(vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(body))));
    await api.saveProfile(profile(provider)); await api.translate('안녕');
    expect((await api.getSnapshot()).runtime.history[0].translated).toBe('hello');
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
    if (provider === 'anthropic') expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    else expect(headers.get('x-goog-api-key')).toBe('fixture-key');
  });
});
