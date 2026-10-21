import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import '../tokens.css';
import '../src/styles.css';
import MiniTranslator, { type MiniTranslatorProps } from '../src/components/MiniTranslator';
import type { TranslationEntry } from '../src/shared/types';
import './mini-mode.preview.css';

const sample: TranslationEntry = { id: 'preview-only', original: '커파 같이 하실 분? 힐러 한 분 구해요!', translated: 'LFM KPQ! Need 1 healer.', direction: 'ko-en', provider: 'local', model: 'preview', durationMs: 0, createdAt: 0, glossaryTerms: [], copied: false, source: 'manual' };
const states = ['default', 'hover', 'focus', 'active', 'disabled', 'loading', 'error', 'success'];
function Specimen({ state }: { state: string }) {
  const [text, setText] = useState(state === 'disabled' ? '' : sample.original);
  const [monitoring, setMonitoring] = useState(false);
  const [copied, setCopied] = useState(state === 'success');
  const [entry, setEntry] = useState<TranslationEntry | undefined>(state === 'disabled' || state === 'default' ? undefined : sample);
  const props: MiniTranslatorProps = {
    text, onTextChange: setText, monitoring, onToggleMonitoring: () => setMonitoring(!monitoring), onRestore: () => {},
    busy: state === 'loading', entry, error: state === 'error' ? '모델 서버에 연결하지 못했어요. 서버를 실행한 뒤 다시 번역해 주세요.' : null,
    copied, autoCopy: true, modifier: 'Ctrl', onTranslate: () => setEntry(sample), onCancel: () => {}, onCopy: () => setCopied(true),
  };
  return <section className={`mini-specimen mini-state-${state}`}><h2>{state}</h2><div className="mini-specimen-frame"><MiniTranslator {...props} /></div></section>;
}
createRoot(document.getElementById('root')!).render(<div className="mini-preview"><h1>미니 번역기 · 상태 미리보기</h1><p>개발용 예시입니다. 실제 API·클립보드는 사용하지 않습니다.</p><div className="mini-specimen-grid">{states.map(state => <Specimen key={state} state={state} />)}</div></div>);
