import { checkText, normalizeCertName } from './text-filter';

describe('checkText', () => {
  it.each([
    ['', 'EMPTY'], ['같이 공부해요 010-1234-5678', 'CONTACT'], ['메일 me@plit.ai.kr 로', 'CONTACT'], ['오픈채팅 들어오세요', 'CONTACT'],
    ['씨 발', 'BANNED'], ['대출 상담', 'BANNED'], ['자료는 bit.ly/abc', 'URL'], ['www.example.com 참고', 'URL'],
  ])('%s → %s', (t, code) => { const r = checkText(t); expect(r.ok).toBe(false); expect((r as any).code).toBe(code); });
  it('정상 문장 통과·공백 정리', () => expect(checkText('  무역·물류 취업 준비생에게 필요해요 ')).toEqual({ ok: true, text: '무역·물류 취업 준비생에게 필요해요' }));
  it('allowEmpty', () => expect(checkText('', { allowEmpty: true }).ok).toBe(true));
});

describe('normalizeCertName (데모 orNormalize)', () => {
  it('공백·괄호·접미어 무시', () => {
    expect(normalizeCertName('정보처리기사 자격증')).toBe(normalizeCertName('정보 처리기사'));
    expect(normalizeCertName('미용사(네일)')).toBe('미용사네일');
    expect(normalizeCertName('초경량비행장치 조종자')).toBe('초경량비행장치조종자');
  });
});
