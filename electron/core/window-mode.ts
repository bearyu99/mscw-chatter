export interface Bounds { x: number; y: number; width: number; height: number }
export const WINDOW_SIZES = {
  full: { width: 1240, height: 870, minWidth: 820, minHeight: 660 },
  mini: { width: 420, height: 420, minWidth: 320, minHeight: 320 },
};

// Work-area coordinates may be negative on a secondary monitor.
export function fitBounds(bounds: Bounds, area: Bounds): Bounds {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    width, height,
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))),
  };
}

interface WindowPort {
  getNormalBounds(): Bounds;
  isMaximized(): boolean;
  unmaximize(): void;
  maximize(): void;
  setMinimumSize(width: number, height: number): void;
  setBounds(bounds: Bounds): void;
}

export class WindowMode {
  private previous?: { bounds: Bounds; maximized: boolean };
  constructor(private window: WindowPort, private mini: boolean, private workArea: (bounds: Bounds) => Bounds) {}
  apply(mini: boolean) {
    if (mini === this.mini) return;
    const current = this.window.getNormalBounds();
    if (mini) this.previous = { bounds: current, maximized: this.window.isMaximized() };
    const area = this.workArea(mini ? current : this.previous?.bounds ?? current);
    const size = mini ? WINDOW_SIZES.mini : WINDOW_SIZES.full;
    const requested = mini ? { ...current, width: size.width, height: size.height }
      : this.previous?.bounds ?? { ...current, x: area.x + (area.width - size.width) / 2, y: area.y + (area.height - size.height) / 2, width: size.width, height: size.height };
    if (this.window.isMaximized()) this.window.unmaximize();
    this.window.setMinimumSize(Math.min(size.minWidth, area.width), Math.min(size.minHeight, area.height));
    this.window.setBounds(fitBounds(requested, area));
    if (!mini && this.previous?.maximized) this.window.maximize();
    this.mini = mini;
  }
}
