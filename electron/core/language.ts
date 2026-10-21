import type { Direction, ResolvedDirection } from '../../src/shared/types';
import { MAX_INPUT_LENGTH } from '../../src/shared/defaults';

export function validateText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('번역할 문장을 입력해 주세요.');
  const text = value.trim();
  if (text.length > MAX_INPUT_LENGTH) throw new Error(`채팅은 한 번에 ${MAX_INPUT_LENGTH.toLocaleString('ko-KR')}자까지 번역할 수 있어요.`);
  return text;
}
export function resolveDirection(text: string, direction: Direction): ResolvedDirection {
  if (direction !== 'auto') return direction;
  if (/[\p{Script=Hangul}]/u.test(text)) return 'ko-en';
  if (/[a-z]/i.test(text)) return 'en-ko';
  throw new Error('한국어나 영어가 포함된 문장을 복사해 주세요.');
}
