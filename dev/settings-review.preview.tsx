import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SETTINGS, emptyRuntime } from '../src/shared/defaults';
import { emptyUsage } from '../src/shared/usage';
import { validateShortcutPair } from '../src/shared/shortcuts';
import type { AppApi, Snapshot } from '../src/shared/types';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import '../tokens.css';
import '../src/styles.css';

// Design fixture only: no real credentials, storage, clipboard, or network calls.
let data: Snapshot = { settings: structuredClone(DEFAULT_SETTINGS), runtime: emptyRuntime(), keys: { openai: true, anthropic: false, google: false, local: false }, platform: 'darwin', version: '0.3.0-local-review', shortcutAvailable: true, native: true, storageWarning: null, usageWarning: null, usage: { openai: { ...emptyUsage(), startedAt: Date.UTC(2026,9,22,5), requests: 14, inputTokens: 10800, outputTokens: 3800, estimatedUsd: 0.00298 }, anthropic: emptyUsage(), google: emptyUsage(), local: emptyUsage() } };
const listeners = new Set<(value: Snapshot) => void>();
const send = () => { for (const cb of listeners) cb(structuredClone(data)); };
window.mscw = {
  getSnapshot: async () => structuredClone(data),
  onSnapshot: cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
  updateSettings: async patch => { validateShortcutPair({ ...data.settings, ...patch }, data.platform); await new Promise(resolve => setTimeout(resolve, 300)); Object.assign(data.settings, patch); send(); return structuredClone(data); },
  saveProfile: async input => { data.settings.provider = input.provider; data.settings.profiles[input.provider] = { model: input.model, endpoint: input.endpoint, localApi: input.localApi }; data.keys[input.provider] = !input.removeKey; send(); return structuredClone(data); },
  testConnection: async () => ({ message: '검토용 연결 성공 상태입니다. 실제 API는 호출하지 않았어요.' }),
  openExternal: async () => {}, setMonitoring: async () => structuredClone(data), translate: async () => {}, cancelTranslation: async () => {}, copyEntry: async () => {}, clearHistory: async () => {},
} satisfies AppApi;
const { default: SettingsPage } = await import('../src/pages/SettingsPage');
const { useEffect, useState } = await import('react');
function Review() {
  const [snapshot, setSnapshot] = useState(data);
  useEffect(() => window.mscw!.onSnapshot(setSnapshot), []);
  useEffect(() => {
    const report = () => {
      const overflow = [...document.querySelectorAll('button,input,select,.shortcut-value,.usage-metrics')].filter(element => { const box = element.getBoundingClientRect(); return box.width > 1 && (box.right > innerWidth + 1 || box.left < -1); }).map(element => element.textContent?.trim().slice(0, 45) || element.tagName);
      parent.postMessage({ kind: 'settings-review-layout', viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow }, location.origin);
    };
    void document.fonts.ready.then(() => requestAnimationFrame(report));
  }, []);
  return <div style={{ padding: '24px', maxWidth: 1060, margin: 'auto' }}><p style={{ marginBottom: 20, color: 'var(--color-accent)' }}>검토용 모의 데이터, 실제 청구액이 아닙니다.</p><SettingsPage snapshot={snapshot} onSnapshot={setSnapshot} notify={() => {}} update={async patch => { setSnapshot(await window.mscw!.updateSettings(patch)); }} /></div>;
}
function States() {
  return <div style={{ padding: 24 }}><h1>단축키 버튼 상태</h1><p>검토용 UI 상태, 실제 API를 사용하지 않습니다.</p>{['default','hover','focus','active','disabled','loading','error','success'].map(state => <div key={state} className="settings-card" style={{ marginTop: 20 }}><p>{state}</p><button type="button" className={`button secondary shortcut-capture is-${state}`} disabled={state === 'disabled' || state === 'loading'} aria-busy={state === 'loading'}>{state === 'loading' ? '저장 중…' : '변경'}</button>{state === 'error' && <p className="form-feedback error" role="alert">다른 앱이 사용 중인 단축키예요. 기존 설정은 유지했어요.</p>}{state === 'success' && <p className="form-feedback success" role="status">단축키를 저장했어요.</p>}</div>)}</div>;
}
createRoot(document.getElementById('root')!).render(createElement(location.search.includes('states=1') ? States : Review));
