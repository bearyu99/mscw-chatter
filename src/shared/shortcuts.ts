import type { Settings } from './types';

const modifierOrder = ['CommandOrControl', 'Control', 'Command', 'Alt', 'Shift'];
const keyPattern = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right)$/;

export function validateShortcut(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100) throw new Error('단축키 형식을 확인해 주세요.');
  const parts = value.split('+'), key = parts.pop()!;
  if (!keyPattern.test(key) || !parts.length || parts.some(p => !modifierOrder.includes(p)) || new Set(parts).size !== parts.length || !parts.some(p => p !== 'Shift')) {
    throw new Error('Ctrl, ⌘ 또는 Alt와 다른 키를 함께 눌러 주세요.');
  }
  if (parts.includes('CommandOrControl') && (parts.includes('Control') || parts.includes('Command'))) throw new Error('중복된 보조 키를 확인해 주세요.');
  return [...modifierOrder.filter(p => parts.includes(p)), key].join('+');
}

function resolved(value: string, platform: string) {
  return validateShortcut(value).replace('CommandOrControl', platform === 'darwin' ? 'Command' : 'Control').split('+').sort().join('+');
}

export function validateShortcutPair(settings: Pick<Settings, 'monitorShortcut' | 'translateShortcut'>, platform: string) {
  if (resolved(settings.monitorShortcut, platform) === resolved(settings.translateShortcut, platform)) throw new Error('두 기능에는 서로 다른 단축키를 지정해 주세요.');
  for (const value of [settings.monitorShortcut, settings.translateShortcut]) {
    const parts = resolved(value, platform).split('+');
    const key = value.split('+').at(-1)!;
    if ((parts.length === 2 && (parts.includes('Command') || parts.includes('Control')) && /^[ACVXZQWHM]$/.test(key)) ||
      resolved(value, platform) === resolved('Alt+F4', platform) || key === 'Tab' ||
      resolved(value, platform) === resolved('Control+Alt+Delete', platform)) {
      throw new Error('복사·붙여넣기나 창 제어에 쓰는 키 대신 다른 조합을 선택해 주세요.');
    }
  }
}

interface KeyEvent { key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean; repeat?: boolean }
function eventKey(event: KeyEvent) {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  const aliases: Record<string, string> = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
  return aliases[event.key] ?? event.key;
}
export function shortcutFromEvent(event: KeyEvent, platform: string): string | null {
  if (event.isComposing || event.repeat || ['Control', 'Meta', 'Alt', 'Shift', 'Dead', 'Process', 'Unidentified'].includes(event.key)) return null;
  const parts = [];
  if (platform === 'darwin' ? event.metaKey : event.ctrlKey) parts.push('CommandOrControl');
  if (platform === 'darwin' && event.ctrlKey) parts.push('Control');
  if (platform !== 'darwin' && event.metaKey) parts.push('Command');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  return validateShortcut([...parts, eventKey(event)].join('+'));
}
export function matchesShortcut(event: KeyEvent, shortcut: string, platform: string) {
  try { const captured = shortcutFromEvent(event, platform); return !!captured && resolved(captured, platform) === resolved(shortcut, platform); }
  catch { return false; }
}
export function formatShortcut(value: string, platform: string) {
  const labels: Record<string, string> = { CommandOrControl: platform === 'darwin' ? '⌘' : 'Ctrl', Control: 'Ctrl', Command: '⌘', Alt: platform === 'darwin' ? '⌥' : 'Alt', Shift: 'Shift', Enter: 'Enter', Space: 'Space' };
  return value.split('+').map(p => labels[p] ?? p).join(' + ');
}
