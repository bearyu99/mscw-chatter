import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, LoaderCircle, Settings2, TriangleAlert } from 'lucide-react';
import { PROVIDERS } from '../shared/defaults';
import type { ProviderId, Snapshot } from '../shared/types';
import './ProviderSelector.css';

interface Props {
  snapshot: Snapshot;
  pending: boolean;
  disabled: boolean;
  onChange(provider: ProviderId): void;
  onManage(): void;
}
export default function ProviderSelector({ snapshot, pending, disabled, onChange, onManage }: Props) {
  const current = snapshot.settings.provider;
  const ready = current === 'local' || snapshot.keys[current];
  const descriptionId = useId();
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const name = PROVIDERS.find(provider => provider.id === current)!.name;
  const blocked = disabled || pending;
  const close = (restoreFocus = false) => { menu.current?.hidePopover(); if (restoreFocus) trigger.current?.focus(); };
  const show = (last = false) => {
    if (blocked || !trigger.current || !menu.current) return;
    const bounds = trigger.current.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    menu.current.showPopover();
    const { height, width } = menu.current.getBoundingClientRect();
    const top = bounds.bottom + height + 16 <= viewportHeight ? bounds.bottom + 8 : Math.max(8, bounds.top - height - 8);
    const right = Math.min(Math.max(8, viewportWidth - bounds.right), Math.max(8, viewportWidth - width - 8));
    setPosition({ top, right });
    const items = menu.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    (last ? items[items.length - 1] : items[0])?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    const dismiss = () => menu.current?.hidePopover();
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => { window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', dismiss, true); };
  }, [open]);
  useEffect(() => { if (blocked) menu.current?.hidePopover(); }, [blocked]);
  const menuKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    if (event.key === 'Tab') { close(true); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };
  return <div className="provider-status provider-picker">
    <button ref={trigger} className="provider-picker-trigger" type="button" data-state={pending ? 'loading' : ready ? 'success' : 'error'} aria-label={`AI 제공자 변경: ${name}`} aria-describedby={descriptionId} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} aria-busy={pending} disabled={blocked} onClick={() => open ? close(true) : show()} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(event.key === 'ArrowUp'); }
    }}>
    <span className="provider-picker-indicator" aria-hidden="true">{pending ? <LoaderCircle size={12} className="spin" /> : ready ? <span className="status-dot ready" /> : <TriangleAlert size={12} />}</span>
    <span className="provider-picker-name" aria-hidden="true">{name}</span>
    <span id={descriptionId} className="provider-picker-state" role="status">{pending ? '변경 중' : ready ? '선택됨' : '연결 필요'}</span>
    <ChevronDown className="provider-picker-arrow" size={13} aria-hidden="true" />
    </button>
    <div ref={menu} id={menuId} className="provider-picker-menu" popover="auto" role="menu" aria-label="AI 제공자 선택" style={{ top: position.top, right: position.right }} onToggle={event => setOpen(event.newState === 'open')} onKeyDown={menuKeys}>
      <p className="provider-picker-menu-label">번역에 사용할 AI</p>
        {PROVIDERS.map(provider => {
          const available = provider.id === 'local' ? snapshot.native : snapshot.keys[provider.id];
          return <button type="button" key={provider.id} role="menuitemradio" aria-checked={provider.id === current} disabled={!available} onClick={() => { close(true); if (provider.id !== current) onChange(provider.id); }}><span>{provider.name}</span><span className="provider-picker-menu-meta">{available ? provider.id === current ? <Check size={14} aria-hidden="true" /> : null : provider.id === 'local' ? '앱 전용' : '키 필요'}</span></button>;
        })}
      <div className="provider-picker-menu-divider" role="separator" />
      <button type="button" role="menuitem" onClick={() => { close(true); onManage(); }}><span>제공자 설정</span><Settings2 size={14} aria-hidden="true" /></button>
    </div>
  </div>;
}
