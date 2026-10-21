import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Server, ShieldCheck, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { api } from '../api';
import { PROVIDERS } from '../shared/defaults';
import type { ProfileInput, ProviderId, SettingsPatch, Snapshot } from '../shared/types';
import { Toggle } from '../components/Toggle';

interface Props { snapshot: Snapshot; onSnapshot(value: Snapshot): void; notify(message: string): void; update(patch: SettingsPatch): Promise<void> }
export default function SettingsPage({ snapshot, onSnapshot, notify, update }: Props) {
  const [provider, setProvider] = useState<ProviderId>(snapshot.settings.provider);
  const [model, setModel] = useState(snapshot.settings.profiles[provider].model);
  const [endpoint, setEndpoint] = useState(snapshot.settings.profiles.local.endpoint);
  const [localApi, setLocalApi] = useState(snapshot.settings.profiles.local.localApi);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [working, setWorking] = useState<'save' | 'test' | 'remove' | null>(null);
  const [feedback, setFeedback] = useState<{ success: boolean; text: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const selected = PROVIDERS.find(p => p.id === provider)!;
  useEffect(() => { setModel(snapshot.settings.profiles[provider].model); setEndpoint(snapshot.settings.profiles.local.endpoint); setLocalApi(snapshot.settings.profiles.local.localApi); setKey(''); setShowKey(false); setFeedback(null); setSaved(false); }, [provider]);
  const input = (): ProfileInput => ({ provider, model: model.trim(), endpoint: endpoint.trim(), localApi, ...(key.trim() ? { apiKey: key.trim() } : {}) });
  const run = async (kind: 'save' | 'test' | 'remove') => {
    if (working) return;
    setWorking(kind); setFeedback(null); setSaved(false);
    try {
      if (kind === 'test') { const result = await api.testConnection(input()); setFeedback({ success: true, text: result.message }); }
      else {
        const result = await api.saveProfile({ ...input(), ...(kind === 'remove' ? { apiKey: undefined, removeKey: true } : {}) });
        onSnapshot(result); setKey(''); setShowKey(false); setSaved(true);
        setFeedback({ success: true, text: kind === 'remove' ? '이 제공자의 저장된 API 키를 삭제했어요.' : '설정을 저장했어요. 실시간 번역에서 시작할 수 있어요.' });
      }
    } catch (error) { setFeedback({ success: false, text: error instanceof Error ? error.message : '연결을 확인해 주세요.' }); }
    finally { setWorking(null); }
  };
  return <div className="settings-page">
    <div className="page-heading"><div><div className="heading-kicker"><SlidersHorizontal size={14} />내 대화에 맞는 번역 환경</div><h1>번역기 설정</h1><p>익숙한 AI를 연결하고, 편한 방식으로 사용하세요.</p></div></div>
    <section className="settings-card"><div className="settings-section-head"><div><h2>AI 제공자</h2><p>번역에 사용할 AI를 선택하세요.</p></div><span className="subtle-badge"><KeyRound size={13} />개인 API 키 사용</span></div>
      <div className="provider-grid" role="group" aria-label="AI 제공자 선택">{PROVIDERS.map(p => <button key={p.id} disabled={!!working} className={`provider-option ${provider === p.id ? 'active' : ''}`} aria-pressed={provider === p.id} onClick={() => setProvider(p.id)}><span className={`provider-monogram provider-${p.id}`}>{p.id === 'local' ? <Server size={18} /> : p.short}</span><strong>{p.name}</strong><span className="provider-radio">{provider === p.id && <span />}</span></button>)}</div>
      <div className="provider-description"><span className="status-dot" />{selected.description}</div>
      <div className="settings-form">
        <div className="form-field"><label htmlFor="model-id">모델 ID</label><input id="model-id" list={`models-${provider}`} value={model} maxLength={160} onChange={event => { setModel(event.target.value); setSaved(false); }} placeholder={selected.models[0]} disabled={!!working} spellCheck={false} autoComplete="off" /><datalist id={`models-${provider}`}>{selected.models.map(m => <option value={m} key={m} />)}</datalist><p>목록에서 선택하거나 계정에서 사용할 수 있는 모델 ID를 직접 입력하세요.</p></div>
        {provider === 'local' && <><div className="form-field"><label htmlFor="local-api">서버 API 형식</label><select id="local-api" value={localApi} disabled={!!working} onChange={event => { const value = event.target.value as 'ollama' | 'openai'; setLocalApi(value); setEndpoint(value === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234/v1'); setSaved(false); }}><option value="ollama">Ollama</option><option value="openai">OpenAI 호환 (LM Studio 등)</option></select></div><div className="form-field"><label htmlFor="local-endpoint">로컬 서버 주소</label><input id="local-endpoint" value={endpoint} maxLength={240} disabled={!!working} onChange={event => { setEndpoint(event.target.value); setSaved(false); }} placeholder="http://127.0.0.1:11434" spellCheck={false} /><p>이 컴퓨터에서 실행 중인 서버만 연결해요. 모델 이름은 설치한 이름과 일치해야 해요.</p></div></>}
        <div className="form-field"><div className="field-label-row"><label htmlFor="api-key">API 키 {provider === 'local' && <span className="optional-label">선택</span>}</label><button className="text-action accent" onClick={() => void api.openExternal(provider === 'local' ? 'ollama' : provider).catch(error => notify(error.message))}>{provider === 'local' ? 'Ollama 설치' : 'API 키 발급받기'}<ArrowUpRight size={13} /></button></div><div className="secret-input"><KeyRound size={16} /><input id="api-key" value={key} onChange={event => { setKey(event.target.value); setSaved(false); }} type={showKey ? 'text' : 'password'} maxLength={4096} placeholder={snapshot.keys[provider] ? '저장된 키 사용 · 변경하려면 새 키 입력' : provider === 'local' ? '인증이 필요한 서버만 입력하세요' : 'API 키를 입력하세요'} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={!!working || !snapshot.native} /><button className="icon-button" onClick={() => setShowKey(!showKey)} aria-label={showKey ? 'API 키 숨기기' : 'API 키 표시'} type="button">{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><p className="key-security"><LockKeyhole size={12} />키는 OS 암호화 저장소로 보호하며 화면에 다시 표시하지 않아요.</p>{snapshot.keys[provider] && <div className="stored-key-row"><span><CheckCircle2 size={13} />이 제공자의 API 키가 저장되어 있어요.</span><button className="text-action danger" disabled={!!working} onClick={() => void run('remove')}>저장된 키 삭제</button></div>}</div>
      </div>
      {feedback && <div className={`form-feedback ${feedback.success ? 'success' : 'error'}`} role={feedback.success ? 'status' : 'alert'}>{feedback.success ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}<span>{feedback.text}</span></div>}
      <div className="settings-actions"><span>연결 테스트는 짧은 번역 요청을 보내요.<br />API 사용량이 발생할 수 있어요.</span><div><button className="button secondary" disabled={!!working || !model.trim()} onClick={() => void run('test')}>{working === 'test' && <LoaderCircle size={15} className="spin" />}연결 테스트</button><button className="button primary" disabled={!!working || !model.trim()} onClick={() => void run('save')}>{working === 'save' ? <LoaderCircle size={15} className="spin" /> : saved ? <Check size={15} /> : null}{saved ? '저장됨' : '설정 저장'}</button></div></div>
    </section>
    <section className="settings-card preferences-card"><div className="settings-section-head"><div><h2>사용 방식</h2><p>자주 사용하는 옵션을 편하게 조정하세요.</p></div></div>{([
      { key: 'autoCopy', title: '번역문 자동 복사', description: '번역이 끝나면 붙여넣을 수 있도록 클립보드에 올려요.' },
      { key: 'glossaryEnabled', title: '메이플 용어집 사용', description: '게임 용어와 약자를 번역 문맥에 참고해요.' },
      { key: 'alwaysOnTop', title: '항상 위에 표시', description: '다른 창을 사용해도 번역기를 위에 표시해요.' },
      { key: 'closeToTray', title: '창을 닫으면 트레이로', description: '창을 닫아도 자동 번역을 계속해요. 트레이 메뉴에서 종료할 수 있어요.' },
    ] as const).map(item => <div className="preference-row" key={item.key}><div><strong>{item.title}</strong><p>{item.description}</p></div><Toggle checked={snapshot.settings[item.key]} onChange={value => void update({ [item.key]: value })} label={item.title} /></div>)}</section>
    <div className="settings-footnote"><ShieldCheck size={16} /><p>자동 번역은 직접 시작해야 켜져요. 감시 중 복사한 텍스트는 선택한 AI 제공자로 전송됩니다.<br />로컬 모델을 선택하면 이 컴퓨터의 로컬 서버로만 전송해요. 번역 기록은 앱을 종료하면 사라져요.</p></div>
  </div>;
}
