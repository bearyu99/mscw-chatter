import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslationController } from '../electron/core/controller';
import { DEFAULT_SETTINGS } from '../src/shared/defaults';
import type { ProviderResult, TranslationRequest } from '../electron/core/providers';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture() {
  let clipboard = 'already copied';
  const writes: string[] = [];
  const settings = structuredClone(DEFAULT_SETTINGS);
  const requests: { input: TranslationRequest; pending: ReturnType<typeof deferred<ProviderResult>> }[] = [];
  const translate = vi.fn((input: TranslationRequest) => { const pending = deferred<ProviderResult>(); requests.push({ input, pending }); return pending.promise; });
  const controller = new TranslationController({ clipboard: { readText: async () => clipboard, writeText: async text => { clipboard = text; writes.push(text); } }, settings: () => settings, getKey: () => 'test-key', translate, onChange: vi.fn() });
  return { controller, settings, requests, writes, translate, copy: (text: string) => { clipboard = text; }, read: () => clipboard };
}

describe('clipboard translation state machine', () => {
  it('starts paused and ignores the pre-existing clipboard on start', async () => {
    const f = fixture(); expect(f.controller.state.monitoring).toBe(false);
    await f.controller.poll(); await f.controller.setMonitoring(true); await f.controller.poll();
    expect(f.translate).not.toHaveBeenCalled();
  });
  it('copies a translated result once and never translates its own output', async () => {
    const f = fixture(); await f.controller.setMonitoring(true); f.copy('안녕하세요'); await f.controller.poll(); await flush();
    expect(f.requests[0].input.direction).toBe('ko-en');
    f.requests[0].pending.resolve({ text: 'Hello!', terms: [] }); await flush();
    expect(f.read()).toBe('Hello!'); expect(f.controller.state.history[0].copied).toBe(true);
    await f.controller.poll(); await f.controller.poll(); expect(f.translate).toHaveBeenCalledTimes(1);
  });
  it('aborts previous requests and drops stale responses even if transport ignores abort', async () => {
    const f = fixture(); await f.controller.setMonitoring(true);
    f.copy('첫 번째'); await f.controller.poll(); await flush();
    f.copy('second'); await f.controller.poll(); await flush();
    expect(f.requests[0].input.signal.aborted).toBe(true);
    f.requests[1].pending.resolve({ text: '두 번째', terms: [] }); await flush();
    f.requests[0].pending.resolve({ text: 'First', terms: [] }); await flush();
    expect(f.writes).toEqual(['두 번째']); expect(f.controller.state.history).toHaveLength(1);
    expect(f.controller.state.history[0].original).toBe('second');
  });
  it('keeps newer clipboard content copied before the next poll', async () => {
    const f = fixture(); await f.controller.setMonitoring(true); f.copy('hello'); await f.controller.poll(); await flush();
    f.copy('newly copied password or text');
    f.requests[0].pending.resolve({ text: '안녕', terms: [] }); await flush();
    expect(f.writes).toHaveLength(0); expect(f.read()).toBe('newly copied password or text');
    expect(f.controller.state.history[0].copied).toBe(false); expect(f.controller.state.notice).toContain('클립보드');
  });
  it('cancels active requests when monitoring is stopped', async () => {
    const f = fixture(); await f.controller.setMonitoring(true); f.copy('hello'); await f.controller.poll(); await flush();
    await f.controller.setMonitoring(false); f.requests[0].pending.resolve({ text: '안녕', terms: [] }); await flush();
    expect(f.writes).toEqual([]); expect(f.controller.state.history).toEqual([]); expect(f.controller.state.monitoring).toBe(false);
  });
  it('invalidates a pending translation even when the next copy contains only numbers', async () => {
    const f = fixture(); await f.controller.setMonitoring(true); f.copy('hello'); await f.controller.poll(); await flush();
    f.copy('123456'); await f.controller.poll();
    f.requests[0].pending.resolve({ text: '안녕', terms: [] }); await flush();
    expect(f.writes).toEqual([]); expect(f.read()).toBe('123456'); expect(f.translate).toHaveBeenCalledTimes(1);
  });
  it('does not request a translation for blank text, numbers or overlong text', async () => {
    const f = fixture(); await f.controller.setMonitoring(true);
    for (const text of ['', '12,000', 'a'.repeat(2001)]) { f.copy(text); await f.controller.poll(); }
    expect(f.translate).not.toHaveBeenCalled(); expect(f.controller.state.notice).toContain('2,000');
  });
  it('does not copy automatically when the user disables auto copy', async () => {
    const f = fixture(); f.settings.autoCopy = false; const promise = f.controller.submit('hello'); await flush();
    f.requests[0].pending.resolve({ text: '안녕', terms: ['TY'] }); await promise;
    expect(f.writes).toEqual([]); expect(f.controller.state.history[0].translated).toBe('안녕');
    await f.controller.copyEntry(f.controller.state.history[0].id); expect(f.read()).toBe('안녕');
  });
  it('does not translate an original copied from app history', async () => {
    const f = fixture(); await f.controller.setMonitoring(true);
    const promise = f.controller.submit('hello'); await flush(); f.requests[0].pending.resolve({ text: '안녕', terms: [] }); await promise;
    await f.controller.copyEntry(f.controller.state.history[0].id, true); await f.controller.poll();
    expect(f.read()).toBe('hello'); expect(f.translate).toHaveBeenCalledTimes(1);
  });
  it('clears an old copied indicator when an external clipboard change is detected', async () => {
    const f = fixture(); await f.controller.setMonitoring(true);
    const promise = f.controller.submit('hello'); await flush(); f.requests[0].pending.resolve({ text: '안녕', terms: [] }); await promise;
    expect(f.controller.state.history[0].copied).toBe(true);
    f.copy('123'); await f.controller.poll();
    expect(f.controller.state.history[0].copied).toBe(false);
  });
  it('marks only the explicitly copied history entry as copied', async () => {
    const f = fixture();
    for (let i = 0; i < 2; i++) { const promise = f.controller.submit(`hello ${i}`); await flush(); f.requests[i].pending.resolve({ text: `안녕 ${i}`, terms: [] }); await promise; }
    const older = f.controller.state.history[1];
    await f.controller.copyEntry(older.id);
    expect(f.controller.state.history.filter(e => e.copied).map(e => e.id)).toEqual([older.id]);
  });
  it('pauses monitoring after an API failure without retrying the paid request', async () => {
    const f = fixture(); await f.controller.setMonitoring(true); f.copy('hello'); await f.controller.poll(); await flush();
    f.requests[0].pending.reject(new Error('사용량 한도')); await flush();
    expect(f.controller.state.monitoring).toBe(false); expect(f.controller.state.error).toBe('사용량 한도');
    await f.controller.poll(); expect(f.translate).toHaveBeenCalledTimes(1); expect(f.writes).toEqual([]);
  });
  it('takes a stable settings snapshot for each request', async () => {
    const f = fixture(); const promise = f.controller.submit('hello'); await flush();
    f.settings.profiles.openai.model = 'changed-model'; f.settings.glossaryEnabled = false;
    expect(f.requests[0].input.profile.model).toBe(DEFAULT_SETTINGS.profiles.openai.model); expect(f.requests[0].input.glossaryEnabled).toBe(true);
    f.requests[0].pending.resolve({ text: '안녕', terms: [] }); await promise;
    expect(f.controller.state.history[0].model).toBe(DEFAULT_SETTINGS.profiles.openai.model);
  });
  it('retains only the most recent 50 entries and clears on request', async () => {
    const f = fixture(); f.settings.autoCopy = false;
    for (let i = 0; i < 55; i++) { const promise = f.controller.submit(`hello ${i}`); await flush(); f.requests[i].pending.resolve({ text: `안녕 ${i}`, terms: [] }); await promise; }
    expect(f.controller.state.history).toHaveLength(50); expect(f.controller.state.history[0].translated).toBe('안녕 54');
    f.controller.clearHistory(); expect(f.controller.state.history).toEqual([]);
  });
});
