import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import ProviderSelector from '../src/components/ProviderSelector';
import { createWebApi } from '../src/web-api';
import type { ProviderId, Snapshot } from '../src/shared/types';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import '../tokens.css';
import '../src/styles.css';

// Visual states only. No key storage, network request or clipboard access.
const initial = await createWebApi({ version: 'component-preview' }).getSnapshot();
initial.keys = { openai: true, anthropic: true, google: true, local: false };
function Preview() {
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const rows = ['default', 'hover', 'focus', 'active', 'disabled', 'loading', 'error', 'success'];
  return <main style={{ padding: 'var(--space-xl)', maxWidth: 720, margin: '0 auto' }}>
    <h1 style={{ fontSize: 'var(--text-xl)' }}>제공자 선택</h1><p style={{ margin: 'var(--space-lg) 0' }}>상태 점, 제공자명, 선택 상태와 화살표가 하나의 클릭 영역입니다.</p>
    {rows.map(state => {
      const snapshot: Snapshot = structuredClone(initial);
      snapshot.settings.provider = provider;
      if (state === 'error') snapshot.keys[provider] = false;
      return <section key={state} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-sm)', padding: 'var(--space-sm) 0', borderBottom: '1px solid var(--color-line)' }}>
        <span>{state}</span><div className={`preview-${state}`}><ProviderSelector snapshot={snapshot} pending={state === 'loading'} disabled={state === 'disabled'} onChange={setProvider} onManage={() => {}} /></div>
      </section>;
    })}
    <style>{`.preview-hover .provider-picker-trigger { background: var(--color-hover); }
      .preview-focus .provider-picker-trigger { outline: 2px solid var(--color-accent); outline-offset: 2px; }
      .preview-active .provider-picker-trigger { background: var(--color-line); }`}</style>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
