import { useMemo, useState } from 'react';
import { ArrowDownUp, ArrowUpRight, BookOpen, Info, Search, X } from 'lucide-react';
import { GLOSSARY } from '../../electron/core/glossary';
import { Toggle } from '../components/Toggle';
import { api } from '../api';

const categories = ['전체', '거래', '파티', '사냥', '아이템', '스킬', '일상'] as const;
export default function GlossaryPage({ enabled, onToggle, notify }: { enabled: boolean; onToggle(value: boolean): void; notify(message: string): void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('전체');
  const terms = useMemo(() => GLOSSARY.filter(term => (category === '전체' || term.category === category) && [term.en, term.ko, ...(term.aliases ?? [])].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())), [query, category]);
  return <div className="glossary-page">
    <div className="page-heading"><div><div className="heading-kicker"><BookOpen size={14} />우리만 아는 그 말도 자연스럽게</div><h1>게임 용어집</h1><p>커파부터 WTB까지. 메이플 속 표현을 번역에 참고해요.</p></div></div>
    <section className={`glossary-banner ${enabled ? 'enabled' : ''}`}><span className="glossary-banner-icon"><BookOpen size={24} /></span><div><strong>번역에 게임 용어 참고하기</strong><p>{enabled ? '켜져 있어요. 문장에 맞는 용어를 AI에 함께 전달해요.' : '꺼져 있어요. 용어집 없이 문장을 번역해요.'}</p></div><Toggle checked={enabled} onChange={onToggle} label="게임 용어집 사용" /></section>
    <section className="glossary-card"><div className="glossary-search"><Search size={18} /><input type="search" aria-label="게임 용어 검색" placeholder="한국어, 영어, 약자로 검색해 보세요" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" aria-label="검색 지우기" onClick={() => setQuery('')}><X size={15} /></button>}</div><div className="glossary-filters" role="group" aria-label="용어 분류">{categories.map(c => <button className={category === c ? 'active' : ''} key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
      <div className="glossary-table-meta"><span>{terms.length}개 용어</span><span><ArrowDownUp size={12} />문맥에 따라 자연스럽게 해석해요</span></div>
      <div className="glossary-table-wrap"><table className="glossary-table"><thead><tr><th scope="col">영어 / 약자</th><th scope="col">한국어 의미</th><th scope="col">분류</th></tr></thead><tbody>{terms.map(term => <tr key={term.en}><td><strong>{term.en}</strong>{term.aliases?.filter(alias => /^[a-zA-Z]/.test(alias)).length ? <span>{term.aliases.filter(alias => /^[a-zA-Z]/.test(alias)).join(' · ')}</span> : null}</td><td>{term.ko}</td><td><span className="category-label">{term.category}</span></td></tr>)}</tbody></table></div>
      {!terms.length && <div className="search-empty"><Search size={24} /><strong>일치하는 용어가 없어요.</strong><p>다른 단어나 약자로 검색해 보세요.</p><button className="button secondary" onClick={() => { setQuery(''); setCategory('전체'); }}>전체 용어 보기</button></div>}
    </section>
    <div className="glossary-source"><div><Info size={16} /><p>사용자가 지정한 커뮤니티 용어집의 약자와 의미를 참고했어요.<br />같은 약자도 문맥에 따라 뜻이 달라요. 용어의 등장이 게임 내 콘텐츠 제공을 뜻하지는 않습니다.</p></div><button className="text-action accent" onClick={() => void api.openExternal('glossary').catch(error => notify(error.message))}>용어집 원문<ArrowUpRight size={14} /></button></div>
  </div>;
}
