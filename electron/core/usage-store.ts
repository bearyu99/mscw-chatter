import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { UsageLedger, type UsageEvent } from '../../src/shared/usage';

export const keyIdentity = (key: string) => key ? createHash('sha256').update(key).digest('hex') : '';

export class UsageStore {
  readonly ledger = new UsageLedger();
  warning: string | null = null;
  private readFailed = false;
  private queue = Promise.resolve();
  constructor(private path: string) {}
  async load() {
    try {
      const raw = await readFile(this.path, 'utf8');
      if (raw.length > 5_000_000) throw new Error('too large');
      this.ledger.restore(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.readFailed = true;
        this.warning = '이전 사용량을 읽지 못했어요. 기존 파일은 보존하며, 이번 실행의 사용량만 표시해요.';
      }
    }
  }
  async record(identity: string, event: UsageEvent) {
    this.ledger.record(identity, event);
    if (this.readFailed) return;
    const work = this.queue.then(async () => {
      try {
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(`${this.path}.tmp`, JSON.stringify(this.ledger.export()), { encoding: 'utf8', mode: 0o600 });
        await rename(`${this.path}.tmp`, this.path);
        this.warning = null;
      } catch { this.warning = '사용량을 파일에 저장하지 못했어요. 이번 실행에서는 표시되지만 앱을 다시 열면 일부 집계가 누락될 수 있어요.'; }
    });
    this.queue = work.catch(() => {});
    await work;
  }
  async flush() { await this.queue; }
}
