import type { Settings, SettingsPatch } from '../../src/shared/types';
import { validateShortcutPair } from '../../src/shared/shortcuts';

interface ShortcutPort { register(value: string, callback: () => void): boolean; unregister(value: string): void }
interface SettingsPort { readonly settings: Settings; updateSettings(patch: SettingsPatch): Promise<void> }

// Register the replacement first. A conflict or disk error leaves the old binding intact.
export class ShortcutManager {
  private active: string | null = null;
  private queue = Promise.resolve();
  constructor(private port: ShortcutPort, private store: SettingsPort, private toggle: () => void, private platform: string) {}
  get available() { return this.active !== null; }
  start() {
    try { if (this.port.register(this.store.settings.monitorShortcut, this.toggle)) this.active = this.store.settings.monitorShortcut; }
    catch { this.active = null; }
  }
  update(patch: SettingsPatch) {
    const work = this.queue.then(async () => {
      const next = { ...this.store.settings, ...patch };
      validateShortcutPair(next, this.platform);
      const replacing = patch.monitorShortcut !== undefined && next.monitorShortcut !== this.active;
      if (replacing) {
        let registered = false;
        try { registered = this.port.register(next.monitorShortcut, this.toggle); } catch { /* Invalid or unavailable OS binding. */ }
        if (!registered) throw new Error('다른 앱이 사용 중이거나 등록할 수 없는 단축키예요. 다른 조합을 선택해 주세요. 기존 설정은 유지했어요.');
      }
      try { await this.store.updateSettings(patch); }
      catch (error) { if (replacing) this.port.unregister(next.monitorShortcut); throw error; }
      if (replacing) { if (this.active) this.port.unregister(this.active); this.active = next.monitorShortcut; }
    });
    this.queue = work.catch(() => {});
    return work;
  }
}
