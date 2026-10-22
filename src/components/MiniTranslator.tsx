import { Check, Copy, CornerDownLeft, LoaderCircle, Maximize2, TriangleAlert, X } from 'lucide-react';
import { useId, type Ref, type ClipboardEventHandler } from 'react';
import { formatShortcut, matchesShortcut } from '../shared/shortcuts';
import { MAX_INPUT_LENGTH } from '../shared/defaults';
import type { TranslationEntry } from '../shared/types';
import './MiniTranslator.css';

export interface MiniTranslatorProps {
  text: string;
  inputRef?: Ref<HTMLTextAreaElement>;
  onTextChange(text: string): void;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
  monitorLabel?: string;
  monitoring: boolean;
  monitorPending?: boolean;
  onToggleMonitoring(): void;
  onRestore(): void;
  modePending?: boolean;
  busy: boolean;
  entry?: TranslationEntry;
  error?: string | null;
  notice?: string | null;
  copied: boolean;
  copyPending?: boolean;
  autoCopy: boolean;
  modifier: string;
  translateShortcut?: string;
  platform?: string;
  onTranslate(): void;
  onCancel(): void;
  onCopy(): void;
}

export default function MiniTranslator(props: MiniTranslatorProps) {
  const inputId = useId(), hintId = useId(), outputLabelId = useId();
  const { text, inputRef, onTextChange, monitoring, monitorPending, onToggleMonitoring, onRestore, modePending,
    busy, entry, error, notice, copied, copyPending, autoCopy, modifier, onTranslate, onCancel, onCopy } = props;
  const succeeded = !error && !busy && (copied || entry?.copied);
  const status = error ? '' : busy ? '번역 중…' : copied ? '복사됨' : entry?.copied ? '클립보드에 복사됨' : '';
  return <main className="mini-translator" aria-label="미니 번역기">
    <header className="mini-toolbar">
      <button type="button" className="mini-monitor" role="switch" aria-checked={monitoring} aria-label={props.monitorLabel ?? '클립보드 자동 번역'} aria-busy={monitorPending} disabled={monitorPending} onClick={onToggleMonitoring}>
        <span className="mini-monitor-label">자동 번역</span>
        <span className="mini-switch-track" aria-hidden="true"><span /></span>
        <span className="mini-monitor-state">{monitorPending ? '변경 중' : monitoring ? '켜짐' : '꺼짐'}</span>
      </button>
      <button type="button" className="mini-icon-button" title="기본 화면으로 돌아가기" aria-label="기본 화면으로 돌아가기" disabled={modePending} onClick={onRestore}><Maximize2 size={18} aria-hidden="true" /></button>
    </header>

    <section className="mini-field mini-source">
      <div className="mini-field-heading"><label htmlFor={inputId}>원문</label><span className="mini-shortcut">{formatShortcut(props.translateShortcut ?? 'CommandOrControl+Enter', props.platform ?? (modifier === '⌘' ? 'darwin' : 'win32'))} 번역</span></div>
      <textarea ref={inputRef} id={inputId} value={text} onChange={event => onTextChange(event.target.value)} onPaste={props.onPaste} maxLength={MAX_INPUT_LENGTH} placeholder="번역할 문장을 입력하거나 붙여넣으세요." readOnly={busy} aria-describedby={hintId} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (matchesShortcut(event.nativeEvent, props.translateShortcut ?? 'CommandOrControl+Enter', props.platform ?? (modifier === '⌘' ? 'darwin' : 'win32'))) { event.preventDefault(); onTranslate(); }
        if (busy && event.key === 'Escape') { event.preventDefault(); onCancel(); }
      }} />
      <div className="mini-field-footer"><span id={hintId} className="mini-hint">{text.length.toLocaleString()} / {MAX_INPUT_LENGTH.toLocaleString()}</span>
        <button type="button" className="mini-text-button" disabled={!busy && !text.trim()} onClick={busy ? onCancel : onTranslate}>{busy ? <><X size={14} aria-hidden="true" />취소</> : <>번역<CornerDownLeft size={14} aria-hidden="true" /></>}</button>
      </div>
    </section>

    <section className={`mini-field mini-output ${error ? 'has-error' : ''}`} aria-busy={busy}>
      <div className="mini-field-heading"><span id={outputLabelId} className="mini-field-label">번역 결과</span>
        <span className={`mini-result-status ${succeeded ? 'is-success' : ''}`} role="status">{busy ? <LoaderCircle size={13} className="spin" aria-hidden="true" /> : succeeded && <Check size={13} aria-hidden="true" />}{status}</span>
      </div>
      {error ? <p className="mini-feedback is-error" role="alert"><TriangleAlert size={14} aria-hidden="true" /><span>{error}</span></p>
        : <textarea readOnly value={busy ? '' : entry?.translated ?? ''} placeholder={busy ? '대화에 맞게 번역하고 있어요…' : '번역된 문장이 여기에 표시돼요.'} aria-labelledby={outputLabelId} />}
      <div className="mini-field-footer">
        <span className="mini-hint mini-output-hint" title={notice || undefined} role={notice ? 'status' : undefined}>{notice || (autoCopy ? '번역 후 자동 복사' : '자동 복사 꺼짐')}</span>
        <button type="button" className={`mini-text-button ${copied ? 'is-success' : ''}`} disabled={busy || !!error || !entry || copyPending} aria-busy={copyPending} onClick={onCopy}>{copyPending ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? '복사됨' : '복사'}</button>
      </div>
    </section>
  </main>;
}
