import { parseCsv, parseRoundsCsv } from './exam-schedule.parser';

const certs = new Set(['industrial-safety', 'barista']);

describe('시험 일정 CSV 파서', () => {
  it('따옴표·쉼표·BOM·CRLF 처리', () => {
    expect(parseCsv('﻿a,"b,c","d""e"\r\n1,2,3\r\n')).toEqual([['a', 'b,c', 'd"e'], ['1', '2', '3']]);
  });

  it('정상 행 + 오류 행을 줄 번호와 함께 분리', () => {
    const csv = [
      'certId,label,applyStart,applyEnd,examDate,resultDate',
      'industrial-safety,2027년 1회,2027-01-10,2027-01-15,2027-02-20,2027-03-12',
      'barista,2027년 1회,,,2027-03-01,',
      'unknown,2027년 1회,,,2027-03-01,',
      'barista,2027년 2회,,,2027-02-30,', // 존재하지 않는 날짜
      'barista,2027년 3회,2027-05-10,2027-05-01,2027-06-01,', // 순서 오류
      'barista,2027년 1회,,,2027-03-01,', // 파일 내 중복
      'barista,,,,2027-03-01,',
      'barista,2027년 4회,,,2027-13-01,', // 없는 월 → 예외 없이 오류 행
    ].join('\n');
    const r = parseRoundsCsv(csv, certs);
    expect(r.valid.map((v) => `${v.certId}/${v.label}`)).toEqual(['industrial-safety/2027년 1회', 'barista/2027년 1회']);
    expect(r.errors.map((e) => e.line)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(r.errors[0].message).toContain('알 수 없는 자격증');
    expect(r.errors[1].message).toContain('날짜 형식');
    expect(r.errors[2].message).toContain('순서');
    expect(r.errors[3].message).toContain('중복');
  });

  it('필수 열 누락 시 헤더 오류', () => {
    expect(parseRoundsCsv('certId,label\nbarista,1회', certs).errors[0].message).toContain('examDate');
  });
});
