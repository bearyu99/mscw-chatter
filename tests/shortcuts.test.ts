import { describe, expect, it, vi } from 'vitest';
import { ShortcutManager } from '../electron/core/shortcuts';
import { DEFAULT_SETTINGS } from '../src/shared/defaults';
import { formatShortcut, matchesShortcut, shortcutFromEvent, validateShortcut, validateShortcutPair } from '../src/shared/shortcuts';

const event = (parts = {}) => ({ key: 'Enter', code: 'Enter', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, ...parts });
function setup(available = true) {
  const store = { settings: structuredClone(DEFAULT_SETTINGS), updateSettings: vi.fn(async (patch: object) => { Object.assign(store.settings, patch); }) };
  const bindings = new Map<string, () => void>();
  const port = { register: vi.fn((value: string, callback: () => void) => { if (!available || bindings.has(value)) return false; bindings.set(value, callback); return true; }), unregister: vi.fn((value: string) => { bindings.delete(value); }) };
  const toggle = vi.fn(), manager = new ShortcutManager(port, store, toggle, 'win32'); manager.start();
  return { store, port, toggle, bindings, manager };
}
describe('shortcut capture and matching', () => {
  it('captures physical keys in Korean layouts and normalizes modifiers', () => {
    expect(shortcutFromEvent(event({ code: 'KeyY', key: 'ㅛ', shiftKey: true }), 'win32')).toBe('CommandOrControl+Shift+Y');
    expect(shortcutFromEvent(event({ metaKey: true, ctrlKey: false }), 'darwin')).toBe('CommandOrControl+Enter');
    expect(validateShortcut('Shift+Alt+F9')).toBe('Alt+Shift+F9');
  });
  it('requires modifiers and rejects malformed keys, IME, and held-key repeats', () => {
    for (const value of ['A', 'Shift+A', 'Control+', 'Control+Shift+Shift+A', 'Control+Escape', 'CommandOrControl+Control+A', 'Super+A']) expect(() => validateShortcut(value)).toThrow();
    expect(shortcutFromEvent(event({ isComposing: true }), 'win32')).toBeNull();
    expect(shortcutFromEvent(event({ repeat: true }), 'win32')).toBeNull();
    expect(shortcutFromEvent(event({ key: 'Control' }), 'win32')).toBeNull();
  });
  it('matches exactly, including extra modifiers, on both operating systems', () => {
    expect(matchesShortcut(event(), 'CommandOrControl+Enter', 'win32')).toBe(true);
    expect(matchesShortcut(event({ shiftKey: true }), 'CommandOrControl+Enter', 'win32')).toBe(false);
    expect(matchesShortcut(event(), 'CommandOrControl+Enter', 'darwin')).toBe(false);
    expect(matchesShortcut(event({ metaKey: true, ctrlKey: false }), 'CommandOrControl+Enter', 'darwin')).toBe(true);
    expect(formatShortcut('CommandOrControl+Shift+Space', 'darwin')).toBe('⌘ + Shift + Space');
  });
  it('protects editing and OS controls and detects equivalent action bindings', () => {
    for (const value of ['CommandOrControl+C', 'CommandOrControl+V', 'Alt+F4', 'Alt+Tab', 'Control+Alt+Delete']) expect(() => validateShortcutPair({ ...DEFAULT_SETTINGS, monitorShortcut: value }, 'win32')).toThrow();
    expect(() => validateShortcutPair({ monitorShortcut: 'Control+Enter', translateShortcut: 'CommandOrControl+Enter' }, 'win32')).toThrow('서로 다른');
  });
});
describe('atomic native shortcut updates', () => {
  it('switches only after saving and keeps the callback functional', async () => {
    const { manager, bindings, toggle, store } = setup();
    await manager.update({ monitorShortcut: 'Alt+Shift+F9' });
    expect(bindings.has(DEFAULT_SETTINGS.monitorShortcut)).toBe(false);
    bindings.get('Alt+Shift+F9')!(); expect(toggle).toHaveBeenCalledOnce();
    expect(store.settings.monitorShortcut).toBe('Alt+Shift+F9'); expect(manager.available).toBe(true);
  });
  it('keeps both config and old binding when another application owns the key', async () => {
    const { manager, bindings, store } = setup(); bindings.set('Alt+F9', () => {});
    await expect(manager.update({ monitorShortcut: 'Alt+F9' })).rejects.toThrow('다른 앱');
    expect(bindings.has(DEFAULT_SETTINGS.monitorShortcut)).toBe(true); expect(store.updateSettings).not.toHaveBeenCalled();
  });
  it('rolls back the replacement if persistence fails', async () => {
    const { manager, bindings, store } = setup(); store.updateSettings.mockRejectedValueOnce(new Error('disk full'));
    await expect(manager.update({ monitorShortcut: 'Alt+F9' })).rejects.toThrow('disk full');
    expect(bindings.has(DEFAULT_SETTINGS.monitorShortcut)).toBe(true); expect(bindings.has('Alt+F9')).toBe(false);
    await manager.update({ monitorShortcut: 'Alt+F10' }); expect(bindings.has('Alt+F10')).toBe(true);
  });
  it('does not block unrelated settings when startup registration was unavailable', async () => {
    const { manager, store } = setup(false); await manager.update({ autoCopy: false });
    expect(store.settings.autoCopy).toBe(false); expect(manager.available).toBe(false);
  });
  it('serializes concurrent replacements without leaving stale bindings', async () => {
    const { manager, bindings, store } = setup();
    await Promise.all([manager.update({ monitorShortcut: 'Alt+F9' }), manager.update({ monitorShortcut: 'Alt+F10' })]);
    expect([...bindings.keys()]).toEqual(['Alt+F10']); expect(store.settings.monitorShortcut).toBe('Alt+F10');
  });
});
