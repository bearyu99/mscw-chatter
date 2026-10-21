import { describe, expect, it } from 'vitest';
import { fitBounds, WindowMode, type Bounds } from '../electron/core/window-mode';

const desktop = { x: 0, y: 25, width: 1920, height: 1055 };
function windowFixture(bounds: Bounds, mini = false, maximized = false, area = desktop) {
  const state = { bounds, maximized, minimum: [0, 0] };
  const port = {
    getNormalBounds: () => ({ ...state.bounds }), isMaximized: () => state.maximized,
    unmaximize: () => { state.maximized = false; }, maximize: () => { state.maximized = true; },
    setMinimumSize: (w: number, h: number) => { state.minimum = [w, h]; },
    setBounds: (next: Bounds) => { state.bounds = next; },
  };
  return { state, mode: new WindowMode(port, mini, () => area) };
}
describe('mini window geometry', () => {
  it('restores the previous full window after repeated compact settings updates', () => {
    const original = { x: 160, y: 100, width: 1120, height: 780 };
    const { state, mode } = windowFixture(original);
    mode.apply(true); expect(state.bounds).toEqual({ x: 160, y: 100, width: 420, height: 420 }); expect(state.minimum).toEqual([320, 320]);
    state.bounds = { x: 500, y: 400, width: 360, height: 360 };
    mode.apply(true); mode.apply(false);
    expect(state.bounds).toEqual(original); expect(state.minimum).toEqual([820, 660]);
  });
  it('unmaximizes in mini mode and restores maximized state', () => {
    const { state, mode } = windowFixture({ x: 200, y: 150, width: 1240, height: 870 }, false, true);
    mode.apply(true); expect(state.maximized).toBe(false);
    mode.apply(false); expect(state.maximized).toBe(true);
  });
  it('can restore a full window when the app starts in persisted mini mode', () => {
    const { state, mode } = windowFixture({ x: 1900, y: 1000, width: 420, height: 420 }, true);
    mode.apply(false);
    expect(state.bounds).toEqual({ x: 340, y: 118, width: 1240, height: 870 });
  });
  it('keeps windows on the visible work area including negative monitor coordinates', () => {
    expect(fitBounds({ x: -20, y: -10, width: 420, height: 420 }, { x: -1920, y: 0, width: 1920, height: 1080 })).toEqual({ x: -420, y: 0, width: 420, height: 420 });
    expect(fitBounds({ x: 2400, y: 1200, width: 1240, height: 870 }, { x: 0, y: 0, width: 1024, height: 768 })).toEqual({ x: 0, y: 0, width: 1024, height: 768 });
  });
});
