import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { ArrowDown, BookOpen, Check, ChevronRight, CircleHelp, Clipboard, Copy, CornerDownLeft, History, Keyboard, Languages, Leaf, LoaderCircle, Minimize2, Monitor, Pause, Pin, Play, Settings2, ShieldCheck, Trash2, X } from 'lucide-react';
import { api } from './api';
import { MAX_INPUT_LENGTH, PROVIDERS } from './shared/defaults';
import type { Direction, Page, Snapshot, TranslationEntry } from './shared/types';
import { Toggle } from './components/Toggle';
import { Modal } from './components/Modal';
import SettingsPage from './pages/SettingsPage';
import GlossaryPage from './pages/GlossaryPage';
import MiniTranslator from './components/MiniTranslator';

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>('translator');
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [help, setHelp] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [modePending, setModePending] = useState(false);
  const [monitorPending, setMonitorPending] = useState(false);
  const [copyPending, setCopyPending] = useState(false);
  const miniInput = useRef<HTMLTextAreaElement>(null);
  const miniButton = useRef<HTMLButtonElement>(null);
  const previousMini = useRef<boolean | undefined>(undefined);
  const act = useCallback(async (work: () => Promise<unknown>) => {
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : '작업을 완료하지 못했어요.'); }
  }, []);
  useEffect(() => {
    const off = api.onSnapshot(setSnapshot);
    void api.getSnapshot().then(setSnapshot).catch(error => setMessage(error.message));
    return off;
  }, []);
  useEffect(() => { if (!message) return; const timeout = setTimeout(() => setMessage(''), 6500); return () => clearTimeout(timeout); }, [message]);
  useEffect(() => { if (!copyFeedback) return; const timeout = setTimeout(() => setCopyFeedback(''), 2200); return () => clearTimeout(timeout); }, [copyFeedback]);
  const newestId = snapshot?.runtime.history[0]?.id;
  useEffect(() => { if (snapshot?.runtime.history[0]) { setText(snapshot.runtime.history[0].original); setSelected(null); } }, [newestId]);
  useEffect(() => {
    const mini = snapshot?.settings.miniMode;
    if (mini === undefined || modePending) return;
    if (mini) miniInput.current?.focus();
    else if (previousMini.current) miniButton.current?.focus();
    previousMini.current = mini;
  }, [snapshot?.settings.miniMode, modePending]);
  if (!snapshot) return <div className="loading-app"><Leaf size={32} /><p>{message || '번역기를 준비하고 있어요…'}</p></div>;
  const { settings, runtime } = snapshot;
  const provider = PROVIDERS.find(p => p.id === settings.provider)!;
  const isReady = settings.provider === 'local' || snapshot.keys[settings.provider];
  const busy = runtime.phase === 'translating';
  const active = runtime.history.find(entry => entry.id === selected) ?? runtime.history[0];
  const displayEntry = busy ? undefined : active;
  const title = { translator: '실시간 번역', glossary: '게임 용어집', settings: '설정' }[page];
  const modifier = snapshot.platform === 'darwin' ? '⌘' : 'Ctrl';
  const update = (patch: Parameters<typeof api.updateSettings>[0]) => act(async () => { setSnapshot(await api.updateSettings(patch)); });
  const setMiniMode = async (enabled: boolean) => {
    if (modePending) return false;
    setModePending(true);
    try {
      setSnapshot(await api.updateSettings({ miniMode: enabled }));
      setHelp(false);
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : '화면을 전환하지 못했어요. 다시 시도해 주세요.'); return false; }
    finally { setModePending(false); }
  };
  const openSettings = async (reason: string) => {
    if (settings.miniMode && !await setMiniMode(false)) return;
    setPage('settings'); setMessage(reason);
  };
  const start = async () => {
    if (monitorPending) return;
    if (!isReady && !runtime.monitoring) { await openSettings('사용할 AI 제공자의 API 키를 먼저 저장해 주세요.'); return; }
    setMonitorPending(true);
    try { await act(async () => { setSnapshot(await api.setMonitoring(!runtime.monitoring)); }); }
    finally { setMonitorPending(false); }
  };
  const translate = async () => {
    if (!text.trim() || busy) return;
    if (!isReady) { await openSettings('API 키를 먼저 연결해 주세요.'); return; }
    setSelected(null);
    void act(() => api.translate(text));
  };
  const copy = async (entry: TranslationEntry, original = false) => {
    if (copyPending) return;
    setCopyPending(true);
    try { await act(async () => { await api.copyEntry(entry.id, original); setCopyFeedback(original ? `original-${entry.id}` : entry.id); }); }
    finally { setCopyPending(false); }
  };
  const pasted = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (snapshot.native || !runtime.monitoring || busy) return;
    const input = event.currentTarget;
    const next = input.value.slice(0, input.selectionStart) + event.clipboardData.getData('text/plain') + input.value.slice(input.selectionEnd);
    if (next.length > MAX_INPUT_LENGTH || !next.trim()) return;
    event.preventDefault(); setText(next); setSelected(null);
    void act(() => api.translate(next));
  };

  if (settings.miniMode) return <MiniTranslator
    text={busy && runtime.pendingText ? runtime.pendingText : text} inputRef={miniInput} onTextChange={setText} onPaste={pasted}
    monitorLabel={snapshot.native ? '클립보드 자동 번역' : '붙여넣기 자동 번역'}
    monitoring={runtime.monitoring} monitorPending={monitorPending} onToggleMonitoring={() => void start()}
    onRestore={() => void setMiniMode(false)} modePending={modePending} busy={busy} entry={displayEntry}
    error={message || runtime.error || snapshot.storageWarning} notice={runtime.notice || (!snapshot.native ? '웹: 원문 창에 붙여넣으면 자동 번역해요.' : null)}
    copied={!!displayEntry && copyFeedback === displayEntry.id} copyPending={copyPending} autoCopy={settings.autoCopy}
    modifier={modifier} onTranslate={() => void translate()} onCancel={() => void act(() => api.cancelTranslation())}
    onCopy={() => { if (displayEntry) void copy(displayEntry); }}
  />;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); setPage('translator'); }} aria-label="글클메 채팅 번역기 홈">
        <span className="brand-mark"><img src="./mark.svg" alt="" /></span>
        <span><strong>글클메</strong><small>채팅 번역기</small></span>
      </a>
      <div className="sidebar-label">WORKSPACE</div>
      <nav aria-label="메인 메뉴">
        <button aria-label="실시간 번역" className={page === 'translator' ? 'nav-item selected' : 'nav-item'} onClick={() => setPage('translator')} aria-current={page === 'translator' ? 'page' : undefined}><Languages aria-hidden="true" size={19} /><span>실시간 번역</span><ChevronRight aria-hidden="true" size={15} className="nav-arrow" /></button>
        <button aria-label="게임 용어집" className={page === 'glossary' ? 'nav-item selected' : 'nav-item'} onClick={() => setPage('glossary')} aria-current={page === 'glossary' ? 'page' : undefined}><BookOpen aria-hidden="true" size={19} /><span>게임 용어집</span></button>
        <button aria-label="설정" className={page === 'settings' ? 'nav-item selected' : 'nav-item'} onClick={() => setPage('settings')} aria-current={page === 'settings' ? 'page' : undefined}><Settings2 aria-hidden="true" size={19} /><span>설정</span></button>
      </nav>
      <div className="sidebar-bottom">
        <div className="game-label"><span className="game-monogram">M</span><div><strong>MapleStory</strong><span>Classic World</span></div></div>
        <div className="sidebar-rule" />
        <div className="version-row"><span className="status-dot subtle" />v{snapshot.version}<span className="platform-label"><Monitor size={13} /> Win / Mac</span></div>
      </div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><span>워크스페이스</span><ChevronRight size={13} /><strong>{title}</strong></div>
        <div className="topbar-actions"><button className="provider-status" onClick={() => setPage('settings')}><span className={`status-dot ${isReady ? 'ready' : 'subtle'}`} />{provider.name}<span className="provider-status-text">{isReady ? '선택됨' : '연결 필요'}</span><ChevronRight size={13} /></button>
          <span className="topbar-separator" />
          <button ref={miniButton} className="icon-button mini-enter-button" title="미니 화면으로 전환" aria-label="미니 화면으로 전환" disabled={modePending} onClick={() => void setMiniMode(true)}><Minimize2 size={17} aria-hidden="true" /><span>미니 화면</span></button>
          {snapshot.native && <button className={`icon-button ${settings.alwaysOnTop ? 'is-pinned' : ''}`} title="항상 위에 표시" aria-label="항상 위에 표시" aria-pressed={settings.alwaysOnTop} onClick={() => void update({ alwaysOnTop: !settings.alwaysOnTop })}><Pin size={17} /></button>}
          <button className="icon-button" title="사용 방법" aria-label="사용 방법" onClick={() => setHelp(true)}><CircleHelp size={18} /></button>
        </div>
      </header>

      {!snapshot.native && <div className="preview-notice"><Monitor size={14} /><span>웹 번역기: API 키와 기록은 이 탭에만 보관해요. 다른 앱의 클립보드 감지는 데스크톱 앱에서 지원해요.</span><a href={`https://github.com/bearyu99/mscw-chatter/releases/tag/v${snapshot.version}`} target="_blank" rel="noopener noreferrer">데스크톱 앱 다운로드 ↗</a></div>}
      {snapshot.storageWarning && <div className="notice warning" role="alert">{snapshot.storageWarning}</div>}

      <main className="main-content">
        {page === 'translator' ? <>
          <div className="page-heading"><div><div className="heading-kicker"><span className="mini-leaf"><Leaf size={14} /></span>함께하는 모험, 더 쉬운 대화</div><h1>복사하고, 번역하고, <span>대화하세요.</span></h1><p>언어가 달라도 괜찮아요. 메이플 속 대화를 자연스럽게 이어가세요.</p></div></div>

          <div className="content-columns"><div className="translation-workbench">
            <section className={`monitor-card ${runtime.monitoring ? 'monitor-on' : ''}`} aria-label="자동 번역">
              <div className="monitor-symbol"><Clipboard size={22} /><span className={runtime.monitoring ? 'monitor-indicator on' : 'monitor-indicator'} /></div>
              <div className="monitor-description"><div className="monitor-title">{snapshot.native ? '클립보드 자동 번역' : '붙여넣기 자동 번역'} <span className={`state-badge ${runtime.monitoring ? 'on' : ''}`}>{runtime.monitoring ? '켜짐' : '꺼짐'}</span></div><p>{snapshot.native ? (runtime.monitoring ? '새로 복사한 문장을 감지하고 있어요.' : '시작하면 새로 복사한 문장을 자동으로 번역해요.') : (runtime.monitoring ? '원문 창에 붙여넣으면 바로 번역해요.' : '시작하면 원문 창에 붙여넣은 문장을 자동으로 번역해요.')}</p></div>
              <button className={runtime.monitoring ? 'button secondary monitor-button' : 'button primary monitor-button'} onClick={start}>{runtime.monitoring ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}<span>{runtime.monitoring ? '번역 중지' : '번역 시작'}</span></button>
            </section>

            <section className="editor-panel" aria-label="채팅 번역">
              <div className="editor-toolbar"><div className="language-switch" role="group" aria-label="번역 방향">{([{ value: 'auto', label: '자동 감지' }, { value: 'ko-en', label: '한 → 영' }, { value: 'en-ko', label: '영 → 한' }] as { value: Direction; label: string }[]).map(item => <button key={item.value} aria-pressed={settings.direction === item.value} className={settings.direction === item.value ? 'active' : ''} onClick={() => void update({ direction: item.value })}>{item.value === 'auto' && <Languages size={14} />}{item.label}</button>)}</div><span className="editor-toolbar-meta"><span className="status-dot" />{busy ? '번역 중' : runtime.monitoring ? '복사 대기 중' : '직접 입력 가능'}</span></div>

              <div className="source-editor"><div className="editor-label"><label htmlFor="chat-input">원문 <span>{busy ? (/[\p{Script=Hangul}]/u.test(runtime.pendingText ?? '') ? '한국어' : '영어') : '입력'}</span></label><button className="text-action" disabled={!text} onClick={() => setText('')}>지우기</button></div>
                <textarea id="chat-input" onPaste={pasted} aria-label="번역할 채팅" placeholder={'번역할 문장을 입력하거나 붙여넣어 주세요.'} value={busy && runtime.pendingText ? runtime.pendingText : text} readOnly={busy} maxLength={MAX_INPUT_LENGTH} onChange={event => setText(event.target.value)} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); translate(); } }} />
                <div className="editor-bottom"><span className="character-count">{(busy ? runtime.pendingText?.length ?? 0 : text.length).toLocaleString()} <span>/ {MAX_INPUT_LENGTH.toLocaleString()}</span></span>{busy ? <button className="button compact secondary" onClick={() => void act(() => api.cancelTranslation())}><X size={14} />취소</button> : <button className="button compact dark" disabled={!text.trim()} onClick={translate}>번역하기 <CornerDownLeft size={14} /><kbd>{modifier} ↵</kbd></button>}</div>
              </div>

              <div className="editor-divider"><span><ArrowDown size={15} /></span></div>
              <div className={`result-editor ${displayEntry ? 'has-result' : ''}`}><div className="editor-label"><span>번역 결과 <span>{displayEntry ? (displayEntry.direction === 'ko-en' ? '영어' : '한국어') : '자동'}</span></span>{displayEntry && <span className="result-duration">{(displayEntry.durationMs / 1000).toFixed(2)}초</span>}</div>
                {busy ? <div className="result-loading" role="status"><LoaderCircle size={22} className="spin" /><strong>대화에 맞게 번역하고 있어요…</strong><span>{provider.name} · {settings.profiles[settings.provider].model}</span></div> : displayEntry ? <div className="result-text" aria-live="polite">{displayEntry.translated}</div> : <div className="result-empty"><span className="empty-language-icon"><Languages size={25} /></span><p>번역된 문장이 여기에 표시돼요.</p><span>한국어와 영어를 자동으로 구분해 번역해 드릴게요.</span></div>}
                <div className="result-footer"><span className="autocopy-label"><Clipboard size={13} />{displayEntry?.copied ? '클립보드에 복사됨' : settings.autoCopy ? '번역 후 클립보드에 자동 복사' : '자동 복사 꺼짐'}</span><button className={`button compact ${displayEntry ? 'secondary' : 'ghost'}`} disabled={!displayEntry} onClick={() => displayEntry && void copy(displayEntry)}>{displayEntry && copyFeedback === displayEntry.id ? <Check size={15} /> : <Copy size={15} />}{displayEntry && copyFeedback === displayEntry.id ? '복사됨' : '번역문 복사'}</button></div>
              </div>
              <div className="glossary-quick"><div className="glossary-quick-icon"><BookOpen size={17} /></div><div><strong>메이플 용어집</strong><p>파퀘, 홀심, WTB… 게임 문맥까지 자연스럽게</p></div><button className="text-action glossary-more" onClick={() => setPage('glossary')}>용어 보기<ChevronRight size={13} /></button><Toggle checked={settings.glossaryEnabled} onChange={value => void update({ glossaryEnabled: value })} label="메이플 용어집 사용" /></div>
            </section>
            {(runtime.error || runtime.notice) && <div className={`notice ${runtime.error ? 'warning' : 'info'}`} role={runtime.error ? 'alert' : 'status'}>{runtime.error || runtime.notice}</div>}

            <section className="history-section" aria-label="최근 번역"><div className="section-heading"><h2><History size={17} />최근 번역 <span>{runtime.history.length}</span></h2><button className="text-action" disabled={!runtime.history.length} onClick={() => void act(async () => { await api.clearHistory(); setSelected(null); })}><Trash2 size={13} />전체 지우기</button></div>
              {!runtime.history.length ? <div className="history-empty"><History size={19} /><p>아직 번역한 대화가 없어요.<span>첫 문장을 번역하고 대화를 시작해 보세요.</span></p></div> : <div className="history-list">{runtime.history.map(entry => <div className={`history-row ${active?.id === entry.id ? 'history-active' : ''}`} key={entry.id}><button className="history-select" onClick={() => { setSelected(entry.id); setText(entry.original); }} aria-label={`번역 기록 보기: ${entry.original}`}><span className="history-direction">{entry.direction === 'ko-en' ? '한 → 영' : '영 → 한'}</span><span className="history-lines"><span>{entry.original}</span><strong>{entry.translated}</strong></span><time>{new Date(entry.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</time></button><button className="icon-button" aria-label="기록의 번역문 복사" onClick={() => void copy(entry)}>{copyFeedback === entry.id ? <Check size={16} /> : <Copy size={16} />}</button></div>)}</div>}
            </section>
          </div>

          <aside className="tips-column" aria-label="사용 안내">
            <section className="howto-card"><div className="section-heading"><h2>대화가 쉬워지는 세 단계</h2><Keyboard size={17} /></div><ol className="steps"><li><span className="step-number">1</span><div><strong>{snapshot.native ? '문장을 복사하세요' : '원문을 붙여넣으세요'}</strong><p>{snapshot.native ? '번역할 글자를 선택하고' : '원문 창에 문장을 입력하고'}</p><div className="key-combo"><kbd>{modifier}</kbd><span>+</span><kbd>{snapshot.native ? 'C' : 'V'}</kbd></div></div></li><li><span className="step-number">2</span><div><strong>잠시만 기다려 주세요</strong><p>{snapshot.native ? <>선택한 AI가 문맥에 맞게<br />번역하고 자동으로 복사해요.</> : <>번역하기를 누른 뒤<br />결과의 복사 버튼을 누르세요.</>}</p></div></li><li><span className="step-number">3</span><div><strong>바로 붙여넣으세요</strong><p>게임 채팅창에서</p><div className="key-combo"><kbd>{modifier}</kbd><span>+</span><kbd>V</kbd></div></div></li></ol><div className="howto-note"><ShieldCheck size={15} /><span>{snapshot.native ? <>자동 번역을 켜 둔 동안에는<br />복사한 텍스트가 선택한 AI로 전송돼요.</> : <>붙여넣기 자동 번역을 켜면<br />원문 창에 붙여넣은 문장만 전송돼요.</>}</span></div></section>
            <section className="example-card"><div className="example-head"><span className="status-dot" /><h2>이런 대화도 자연스럽게</h2><span>예시</span></div><div className="example-original">커파 같이 하실 분?<br />힐러 한 분 구해요!</div><div className="example-arrow"><ArrowDown size={16} /><span>게임 용어집 사용</span></div><div className="example-translation">LFM KPQ!<br />Need 1 healer.</div><div className="example-foot"><BookOpen size={13} /><span>커파 → KPQ</span></div></section>
            <div className="shortcut-tip"><Keyboard size={16} /><div><strong>게임 중에도 간편하게</strong><p>{snapshot.shortcutAvailable ? <><kbd>{modifier} ⇧ Space</kbd><br />자동 번역 켜기 / 끄기</> : snapshot.native ? '트레이 아이콘에서 자동 번역을 켜고 끌 수 있어요.' : '데스크톱 앱에서 단축키로 자동 번역을 켜고 끌 수 있어요.'}</p></div></div>
          </aside></div>
          <footer className="workspace-footer"><span><ShieldCheck size={13} />번역 기록은 이 세션에만 보관해요.</span><span>MapleStory Classic World를 위한 작은 도우미</span></footer>
        </> : page === 'settings' ? <SettingsPage snapshot={snapshot} onSnapshot={setSnapshot} notify={setMessage} update={update} /> : <GlossaryPage enabled={settings.glossaryEnabled} onToggle={value => void update({ glossaryEnabled: value })} notify={setMessage} />}
      </main>
    </div>
    {message && <div className="toast" role="alert"><CircleHelp size={18} /><span>{message}</span><button className="icon-button" aria-label="알림 닫기" onClick={() => setMessage('')}><X size={16} /></button></div>}
    {help && <Modal title="복사 한 번으로 대화 준비" onClose={() => setHelp(false)}><div className="help-content">{snapshot.native ? <><p>설정에서 AI 제공자와 모델을 선택하고 API 키를 저장해 주세요. 로컬 모델은 실행 중인 Ollama 또는 OpenAI 호환 서버를 연결하면 됩니다.</p><ol><li><strong>번역 시작</strong>을 누르세요. 이전 클립보드는 번역하지 않아요.</li><li>선택·복사가 가능한 곳에서 문장을 복사하세요.</li><li>결과의 <strong>클립보드에 복사됨</strong> 표시를 확인하고 붙여넣으세요.</li></ol><p>게임 채팅이 선택·복사를 지원하지 않으면 원문 입력창을 사용해 주세요. 화면 인식(OCR)이나 게임으로 자동 전송하는 기능은 포함하지 않습니다.</p><p>번역 방향을 수동으로 고정할 수 있어요. 단어를 검색하려면 게임 용어집을 열어 보세요. 창을 닫으면 트레이에서 계속 실행되며, 종료는 트레이 메뉴에서 할 수 있습니다.</p></> : <><p>설정에서 OpenAI, Anthropic 또는 Google과 모델을 선택하고 본인의 API 키를 연결하세요. 키와 기록은 이 탭에만 보관하며, 새로고침하거나 페이지를 떠나면 키를 다시 입력해야 해요.</p><ol><li>원문 창에 문장을 입력하거나 붙여넣으세요.</li><li><strong>번역하기</strong>를 누르거나 <strong>붙여넣기 자동 번역</strong>을 켜세요.</li><li>결과의 <strong>번역문 복사</strong>를 누르고 게임에 붙여넣으세요.</li></ol><p>웹에서는 다른 앱의 클립보드 감시와 로컬 모델 연결을 지원하지 않아요. 상단에서 데스크톱 앱을 받을 수 있어요.</p></>}<button className="button primary" onClick={() => setHelp(false)}>확인했어요<Check size={16} /></button></div></Modal>}
  </div>;
}
