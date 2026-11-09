/** 시험 일정 입력 공통 형식 (출처와 무관) — 날짜는 KST 달력일 YYYY-MM-DD */
export interface ExamRoundInput {
  certId: string;
  label: string;
  applyStart?: string | null;
  applyEnd?: string | null;
  examDate: string;
  resultDate?: string | null;
}
export interface RowError { line: number; message: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const HEADER = ['certId', 'label', 'applyStart', 'applyEnd', 'examDate', 'resultDate'] as const;

/** KST 자정 → UTC Date */
export const kstDay = (d: string) => new Date(`${d}T00:00:00+09:00`);
const validDate = (d: string) => {
  if (!DATE.test(d)) return false;
  const t = new Date(`${d}T12:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d; // 2027-02-30 처럼 넘어가는 날짜 거절
};

/** 따옴표 필드·쉼표 포함 값을 지원하는 최소 CSV 파서 (RFC 4180 부분집합) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/** 행 검증: 필수값, 날짜 형식·실존 날짜, 접수시작 ≤ 접수마감 ≤ 시험일 ≤ 발표일 */
export function validateRound(r: ExamRoundInput, knownCerts: Set<string>): string | null {
  if (!r.certId || !knownCerts.has(r.certId)) return `알 수 없는 자격증 ID: ${r.certId || '(빈 값)'}`;
  if (!r.label || r.label.length > 50) return '회차명(label)은 1~50자여야 해요';
  for (const k of ['applyStart', 'applyEnd', 'examDate', 'resultDate'] as const) {
    const v = r[k];
    if (k === 'examDate' && !v) return '시험일(examDate)은 필수예요';
    if (v && !validDate(v)) return `${k} 날짜 형식이 잘못됐어요 (YYYY-MM-DD): ${v}`;
  }
  const order = [r.applyStart, r.applyEnd, r.examDate, r.resultDate].filter(Boolean) as string[];
  for (let i = 1; i < order.length; i++) if (order[i] < order[i - 1]) return '날짜 순서가 맞지 않아요 (접수시작 ≤ 접수마감 ≤ 시험일 ≤ 발표일)';
  return null;
}

export function parseRoundsCsv(text: string, knownCerts: Set<string>) {
  const rows = parseCsv(text);
  const errors: RowError[] = [];
  const valid: ExamRoundInput[] = [];
  if (!rows.length) return { valid, errors: [{ line: 1, message: '빈 파일이에요' }] };
  const head = rows[0].map((h) => h.trim());
  const idx = Object.fromEntries(HEADER.map((h) => [h, head.indexOf(h)]));
  const missing = ['certId', 'label', 'examDate'].filter((h) => idx[h] < 0);
  if (missing.length) return { valid, errors: [{ line: 1, message: `필수 열이 없어요: ${missing.join(', ')} (헤더: ${HEADER.join(',')})` }] };
  const seen = new Set<string>();
  rows.slice(1).forEach((cols, i) => {
    const get = (h: (typeof HEADER)[number]) => (idx[h] >= 0 ? (cols[idx[h]] ?? '').trim() || null : null);
    const r: ExamRoundInput = { certId: get('certId') ?? '', label: get('label') ?? '', applyStart: get('applyStart'), applyEnd: get('applyEnd'), examDate: get('examDate') ?? '', resultDate: get('resultDate') };
    const err = validateRound(r, knownCerts);
    const key = `${r.certId}|${r.label}`;
    if (err) errors.push({ line: i + 2, message: err });
    else if (seen.has(key)) errors.push({ line: i + 2, message: `파일 안에서 중복된 회차예요: ${key}` });
    else { seen.add(key); valid.push(r); }
  });
  return { valid, errors };
}
