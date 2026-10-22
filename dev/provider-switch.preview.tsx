import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { createWebApi } from '../src/web-api';
import { DEFAULT_SETTINGS } from '../src/shared/defaults';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import '../tokens.css';
import '../src/styles.css';
// Isolated UI fixture. Fake keys remain in memory. No cloud or system clipboard access.
const fixture = createWebApi({ version: '0.3.0-local-review', fetcher: async (url) => {
  const provider = String(url).includes('googleapis') ? 'google' : 'openai';
  const translated = provider === 'google' ? 'Google 모의 번역 결과' : 'OpenAI 모의 번역 결과';
  return Response.json(provider === 'google' ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: translated }] } }] } : { choices: [{ finish_reason: 'stop', message: { content: translated } }] });
}, clipboard: { writeText: async () => {} } });
for (const provider of ['google', 'openai'] as const) await fixture.saveProfile({ ...DEFAULT_SETTINGS.profiles[provider], provider, apiKey: `review-fixture-${provider}` });
const scenario = new URLSearchParams(location.search).get('switch');
if (scenario) {
  const update = fixture.updateSettings;
  fixture.updateSettings = async patch => {
    if (patch.provider === 'google') {
      if (scenario === 'failure') throw new Error('검토용 저장 실패: 기존 제공자를 유지했어요.');
      if (scenario === 'pending') await new Promise(resolve => setTimeout(resolve, 3000));
    }
    return update(patch);
  };
}
window.mscw = fixture;
const { default: App } = await import('../src/App');
createRoot(document.getElementById('root')!).render(createElement(App));
if (new URLSearchParams(location.search).has('layout')) {
  const report = () => {
    const select = document.querySelector('.provider-picker-trigger');
    if (!select) { requestAnimationFrame(report); return; }
    const box = select.getBoundingClientRect();
    const header = document.querySelector('.topbar')!;
    const bounds = header.getBoundingClientRect();
    parent.postMessage({ kind: 'provider-layout', width: innerWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, selectHeight: box.height, headerOverflow: header.scrollWidth > bounds.width, selectInsideHeader: box.left >= bounds.left && box.right <= bounds.right }, location.origin);
  };
  requestAnimationFrame(report);
}
