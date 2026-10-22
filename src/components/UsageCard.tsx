import { ArrowUpRight, ReceiptText, TriangleAlert } from 'lucide-react';
import { api } from '../api';
import { PROVIDERS } from '../shared/defaults';
import { PRICING_CHECKED_AT } from '../shared/usage';
import type { ProviderId, Snapshot } from '../shared/types';

export default function UsageCard({ snapshot, provider, notify }: { snapshot: Snapshot; provider: ProviderId; notify(message: string): void }) {
  const usage = snapshot.usage[provider], connected = snapshot.keys[provider];
  const name = PROVIDERS.find(p => p.id === provider)!.name;
  const priced = usage.requests - usage.unpricedRequests - usage.unconfirmedRequests;
  const amount = !connected || (usage.requests > 0 && priced === 0) ? '—' : usage.estimatedUsd > 0 && usage.estimatedUsd < 0.0001 ? '< $0.0001' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(usage.estimatedUsd);
  return <section className="settings-card usage-card" aria-labelledby="usage-heading">
    <div className="settings-section-head"><div><h2 id="usage-heading">API 사용 요금</h2><p>{name}에 연결한 키로 이 앱에서 사용한 금액이에요.</p></div><ReceiptText size={18} aria-hidden="true" /></div>
    {provider === 'local' ? <p className="usage-empty">로컬 모델에는 외부 AI 제공자의 API 요금이 발생하지 않아요.</p> : <>
      <div className="usage-total"><div><span className="usage-caption">누적 예상 요금 <span className="subtle-badge">USD</span></span><strong aria-live="polite">{amount}</strong><p>{usage.startedAt ? `${new Date(usage.startedAt).toLocaleString('ko-KR')}부터 집계` : connected ? '첫 요청부터 사용량을 집계해요.' : 'API 키를 연결하면 집계를 시작해요.'}</p></div>
        <button type="button" className="button secondary" onClick={() => void api.openExternal(`billing-${provider}`).catch(error => notify(error.message))}>공식 청구 내역<ArrowUpRight size={14} aria-hidden="true" /></button>
      </div>
      <dl className="usage-metrics"><div><dt>요청</dt><dd>{usage.requests.toLocaleString()}<span>회</span></dd></div><div><dt>입력 토큰</dt><dd>{usage.inputTokens.toLocaleString()}</dd></div><div><dt>출력 토큰</dt><dd>{usage.outputTokens.toLocaleString()}</dd></div></dl>
      {(usage.unpricedRequests > 0 || usage.unconfirmedRequests > 0) && <div className="usage-warning" role="status"><TriangleAlert size={15} aria-hidden="true" /><p>표시 금액은 계산 가능한 요청만 포함해요.{usage.unpricedRequests > 0 && ` 단가 미지원 ${usage.unpricedRequests}회.`}{usage.unconfirmedRequests > 0 && ` 취소·연결 오류 등 사용량 확인 불가 ${usage.unconfirmedRequests}회.`} 실제 요금은 공식 청구 내역에서 확인하세요.</p></div>}
      <div className="usage-explanation"><p>번역과 연결 테스트의 응답 토큰을 유료 표준 단가로 계산해요. 무료 구간, 할인, 세금은 반영하지 않으며 실제 청구액과 다를 수 있어요.</p><p>이 기능을 사용하기 전이나 다른 앱에서 쓴 금액은 포함하지 않아요. {snapshot.native ? '앱을 다시 실행해도 집계가 유지돼요.' : '웹 집계는 이 탭에서만 유지돼요.'} 단가 확인: {PRICING_CHECKED_AT}</p><p>저장된 키 기준이에요. 새 키의 연결 테스트 사용량은 해당 키를 저장한 뒤 확인할 수 있어요.</p></div>
    </>}
    {snapshot.usageWarning && <div className="form-feedback error" role="alert"><TriangleAlert size={17} /><span>{snapshot.usageWarning}</span></div>}
  </section>;
}
