import { randomUUID } from 'node:crypto';
import { emptyRuntime, MAX_INPUT_LENGTH } from '../../src/shared/defaults';
import type { RuntimeState, Settings, TranslationEntry } from '../../src/shared/types';
import { resolveDirection, validateText } from './language';
import { translateWithProvider, type ProviderResult, type TranslationRequest } from './providers';

export interface ClipboardPort { readText(): Promise<string>; writeText(text: string): Promise<void> }
interface Dependencies {
  clipboard: ClipboardPort;
  settings(): Settings;
  getKey(provider: Settings['provider']): string;
  translate?: (request: TranslationRequest) => Promise<ProviderResult>;
  onChange(): void;
}

export class TranslationController {
  state: RuntimeState = emptyRuntime();
  private observed = '';
  private generation = 0;
  private abort: AbortController | null = null;
  private polling = false;
  private writing = false;
  private readingForStart = 0;
  constructor(private deps: Dependencies) {}

  async setMonitoring(enabled: boolean) {
    const startId = ++this.readingForStart;
    this.cancel();
    if (enabled) {
      const settings = this.deps.settings();
      if (settings.provider !== 'local' && !this.deps.getKey(settings.provider)) throw new Error('설정에서 API 키를 저장한 뒤 자동 번역을 시작해 주세요.');
      const baseline = await this.deps.clipboard.readText();
      if (startId !== this.readingForStart) return;
      this.observed = baseline;
    }
    this.state.monitoring = enabled;
    this.state.phase = enabled ? 'watching' : 'idle';
    this.state.error = null;
    this.state.notice = null;
    this.deps.onChange();
  }

  async poll() {
    if (!this.state.monitoring || this.polling || this.writing) return;
    this.polling = true;
    try {
      const text = await this.deps.clipboard.readText();
      if (!this.state.monitoring || this.writing || text === this.observed) return;
      this.observed = text;
      for (const entry of this.state.history) entry.copied = false;
      // Even a non-chat copy must invalidate a pending translation.
      this.cancel(false);
      if (!text.trim() || !/[\p{Script=Hangul}a-zA-Z]/u.test(text)) { this.deps.onChange(); return; }
      if (text.trim().length > MAX_INPUT_LENGTH) {
        this.state.notice = `${MAX_INPUT_LENGTH.toLocaleString('ko-KR')}자를 넘는 복사 내용은 건너뛰었어요.`;
        this.deps.onChange();
        return;
      }
      void this.submit(text, 'clipboard', text).catch(error => {
        this.state.error = error instanceof Error ? error.message : '자동 번역을 시작하지 못했어요.';
        this.state.monitoring = false;
        this.state.phase = 'error';
        this.deps.onChange();
      });
    } catch {
      this.state.error = '클립보드를 읽을 수 없어요. 잠시 후 다시 복사해 주세요.';
      this.state.phase = 'error';
      this.deps.onChange();
    } finally { this.polling = false; }
  }

  async submit(value: string, source: 'clipboard' | 'manual' = 'manual', expectedClipboard?: string) {
    const text = validateText(value);
    const settings = structuredClone(this.deps.settings());
    const direction = resolveDirection(text, settings.direction);
    const apiKey = this.deps.getKey(settings.provider);
    if (settings.provider !== 'local' && !apiKey) throw new Error('설정에서 API 키를 먼저 저장해 주세요.');
    this.cancel(false);
    const generation = this.generation;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.state.phase = 'translating';
    this.state.pendingText = text;
    this.state.error = null;
    this.state.notice = null;
    this.deps.onChange();
    const start = performance.now();
    try {
      const expected = expectedClipboard ?? await this.deps.clipboard.readText();
      if (generation !== this.generation) return;
      const result = await (this.deps.translate ?? translateWithProvider)({ text, direction, provider: settings.provider, profile: settings.profiles[settings.provider], apiKey, glossaryEnabled: settings.glossaryEnabled, signal });
      if (generation !== this.generation || signal.aborted) return;
      const entry: TranslationEntry = { id: randomUUID(), original: text, translated: result.text, direction, provider: settings.provider, model: settings.profiles[settings.provider].model, durationMs: Math.round(performance.now() - start), createdAt: Date.now(), glossaryTerms: result.terms, copied: false, source };
      if (settings.autoCopy) {
        const current = await this.deps.clipboard.readText();
        if (generation !== this.generation || signal.aborted) return;
        if (current === expected) {
          await this.writeManaged(result.text);
          entry.copied = true;
        } else {
          this.state.notice = '다른 내용을 복사해서 클립보드를 유지했어요. 아래에서 번역문을 직접 복사할 수 있어요.';
        }
      }
      if (generation !== this.generation || signal.aborted) return;
      this.state.history = [entry, ...this.state.history].slice(0, 50);
      this.state.phase = this.state.monitoring ? 'watching' : 'idle';
      this.state.pendingText = null;
      this.abort = null;
      this.deps.onChange();
    } catch (error) {
      if (generation !== this.generation || signal.aborted) return;
      this.abort = null;
      this.state.phase = 'error';
      this.state.pendingText = null;
      this.state.error = error instanceof Error ? error.message : '번역에 실패했어요. 다시 시도해 주세요.';
      // Avoid a repeated paid request after connection/limit failures.
      if (source === 'clipboard') this.state.monitoring = false;
      this.deps.onChange();
    }
  }

  cancel(emit = true) {
    ++this.generation;
    this.abort?.abort();
    this.abort = null;
    this.state.pendingText = null;
    this.state.phase = this.state.monitoring ? 'watching' : 'idle';
    if (emit) { this.state.error = null; this.deps.onChange(); }
  }
  async copyEntry(id: string, original = false) {
    const entry = this.state.history.find(e => e.id === id);
    if (!entry) throw new Error('번역 기록을 찾을 수 없어요.');
    this.cancel(false);
    const text = original ? entry.original : entry.translated;
    await this.writeManaged(text);
    if (!original) entry.copied = true;
    this.state.notice = original ? '원문을 복사했어요.' : '번역문을 복사했어요. 게임에서 붙여넣어 주세요.';
    this.deps.onChange();
  }
  clearHistory() {
    this.cancel(false);
    this.state.history = [];
    this.state.error = null;
    this.state.notice = null;
    this.deps.onChange();
  }
  private async writeManaged(text: string) {
    this.writing = true;
    try {
      await this.deps.clipboard.writeText(text);
      this.observed = text;
      for (const entry of this.state.history) entry.copied = false;
    } finally { this.writing = false; }
  }
}
