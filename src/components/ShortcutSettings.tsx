import { useEffect, useState } from 'react';
import { Check, Keyboard, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react';
import { api } from '../api';
import { DEFAULT_SETTINGS } from '../shared/defaults';
import { formatShortcut, shortcutFromEvent, validateShortcutPair } from '../shared/shortcuts';
import type { Snapshot } from '../shared/types';

type Action = 'monitorShortcut' | 'translateShortcut';
export default function ShortcutSettings({ snapshot, onSnapshot }: { snapshot: Snapshot; onSnapshot(value: Snapshot): void }) {
  const [draft, setDraft] = useState({ monitorShortcut: snapshot.settings.monitorShortcut, translateShortcut: snapshot.settings.translateShortcut });
  const [recording, setRecording] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  useEffect(() => { setDraft({ monitorShortcut: snapshot.settings.monitorShortcut, translateShortcut: snapshot.settings.translateShortcut }); }, [snapshot.settings.monitorShortcut, snapshot.settings.translateShortcut]);
  const dirty = draft.monitorShortcut !== snapshot.settings.monitorShortcut || draft.translateShortcut !== snapshot.settings.translateShortcut;
  async function save() {
    setPending(true); setFeedback(null);
    try {
      validateShortcutPair(draft, snapshot.platform);
      onSnapshot(await api.updateSettings(snapshot.native ? draft : { translateShortcut: draft.translateShortcut }));
      setFeedback({ error: false, text: snapshot.native ? '단축키를 저장했어요. 다시 실행해도 유지돼요.' : '이 탭의 단축키를 변경했어요.' });
    } catch (error) { setFeedback({ error: true, text: error instanceof Error ? error.message : '단축키를 저장하지 못했어요.' }); }
    finally { setPending(false); }
  }
  return <section className="settings-card shortcut-card" aria-labelledby="shortcut-heading">
    <div className="settings-section-head"><div><h2 id="shortcut-heading">단축키</h2><p>변경 버튼을 누른 뒤 원하는 키 조합을 누르세요.</p></div><Keyboard size={18} aria-hidden="true" /></div>
    {([
      { action: 'monitorShortcut', title: '자동 번역 켜기 / 끄기', description: snapshot.native ? '게임 등 다른 앱을 사용하는 중에도 작동해요.' : '다른 앱에서 쓰는 단축키는 데스크톱 앱에서 지원해요.' },
      { action: 'translateShortcut', title: '입력한 문장 번역', description: '기본 화면과 미니 화면의 원문 입력창에서 작동해요.' },
    ] as const).map(({ action, title, description }) => <div className="shortcut-row" key={action}>
      <div><strong>{title}</strong><p id={`${action}-help`}>{description}</p></div>
      <div className="shortcut-controls"><output className="shortcut-value" aria-label={`${title} 단축키`}>{formatShortcut(draft[action], snapshot.platform)}</output>
        <button type="button" className={`button secondary shortcut-capture ${recording === action ? 'is-recording' : ''}`} disabled={pending || (!snapshot.native && action === 'monitorShortcut')} aria-pressed={recording === action} aria-describedby={`${action}-help shortcut-recording-help`} onClick={() => { setRecording(recording === action ? null : action); setFeedback(null); }} onBlur={() => setRecording(null)} onKeyDown={event => {
          if (recording !== action || event.key === 'Tab') return;
          event.preventDefault(); event.stopPropagation();
          if (event.key === 'Escape') { setRecording(null); return; }
          try {
            const value = shortcutFromEvent(event.nativeEvent, snapshot.platform);
            if (!value) return;
            const next = { ...draft, [action]: value };
            validateShortcutPair(next, snapshot.platform);
            setDraft(next); setRecording(null); setFeedback(null);
          } catch (error) { setFeedback({ error: true, text: (error as Error).message }); }
        }}>{recording === action ? '키를 눌러 주세요…' : '변경'}</button>
      </div>
    </div>)}
    <p className="shortcut-help" id="shortcut-recording-help">Ctrl, ⌘ 또는 Alt와 다른 키를 함께 사용하세요. Esc로 변경을 취소할 수 있어요.</p>
    {snapshot.native && !snapshot.shortcutAvailable && <div className="form-feedback error" role="alert"><TriangleAlert size={17} /><span>자동 번역 단축키를 등록하지 못했어요. 다른 키 조합으로 변경해 주세요. 트레이 메뉴에서도 자동 번역을 켤 수 있어요.</span></div>}
    {feedback && <div className={`form-feedback ${feedback.error ? 'error' : 'success'}`} role={feedback.error ? 'alert' : 'status'}>{feedback.error ? <TriangleAlert size={17} /> : <Check size={17} />}<span>{feedback.text}</span></div>}
    <div className="shortcut-actions"><button type="button" className="button secondary" disabled={pending || !!recording} onClick={() => { setDraft({ monitorShortcut: DEFAULT_SETTINGS.monitorShortcut, translateShortcut: DEFAULT_SETTINGS.translateShortcut }); setFeedback(null); }}><RotateCcw size={14} />기본값</button><button type="button" className="button primary" disabled={!dirty || pending || !!recording} onClick={() => void save()}>{pending && <LoaderCircle size={15} className="spin" />}단축키 저장</button></div>
  </section>;
}
