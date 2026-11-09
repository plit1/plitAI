/**
 * 사용자 입력 공통 필터 (데모 v2.9 orPrivacyHit · orBannedHit · srCheckText 이관).
 * 개인 연락처·외부 유도·금칙어를 서버에서 차단한다. 스터디룸·커뮤니티에서 재사용.
 */
const BANNED = ['시발', '씨발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '개새', '좆', '지랄', '섹스', '도박', '토토', '카지노', '대출', '광고문의', 'fuck', 'shit', 'bitch'];
const PHONE = /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const MESSENGER = /카톡|카카오톡|오픈채팅|오픈톡|kakao|텔레그램|telegram/i;
const URL_LIKE = /(https?:\/\/|www\.|bit\.ly|t\.me\/|\b[a-z0-9-]+\.(com|net|kr|co|io|me|ly|gg|xyz|shop|site|link)\b)/i;

export type FilterCode = 'EMPTY' | 'BANNED' | 'CONTACT' | 'URL';
export function checkText(raw: unknown, opts: { allowEmpty?: boolean; allowUrl?: boolean } = {}): { ok: true; text: string } | { ok: false; code: FilterCode; message: string } {
  const text = String(raw ?? '').trim();
  if (!text) return opts.allowEmpty ? { ok: true, text } : { ok: false, code: 'EMPTY', message: '내용을 입력해주세요.' };
  const norm = text.toLowerCase().replace(/\s+/g, '');
  if (BANNED.some((w) => norm.includes(w))) return { ok: false, code: 'BANNED', message: '금칙어가 포함돼 있어요. 표현을 바꿔 다시 입력해주세요.' };
  if (PHONE.test(text) || EMAIL.test(text) || MESSENGER.test(text)) return { ok: false, code: 'CONTACT', message: '전화번호·이메일·메신저 등 개인 연락처는 올릴 수 없어요.' };
  if (!opts.allowUrl && URL_LIKE.test(text)) return { ok: false, code: 'URL', message: '외부 링크·광고성 URL은 올릴 수 없어요.' };
  return { ok: true, text };
}

/** 데모 orNormalize: 자격증 이름 비교용 정규화 ("정보처리기사 자격증" == "정보 처리기사") */
export function normalizeCertName(name: string) {
  return String(name || '').toLowerCase()
    .replace(/\(.*?\)/g, (m) => m.replace(/[()]/g, ''))
    .replace(/자격증|자격|시험$/g, '')
    .replace(/[\s·.\-_/,'"]+/g, '');
}
