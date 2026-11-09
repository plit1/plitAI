import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { AppError } from '../../common/errors';

export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
/** 확장자·Content-Type 이 아니라 파일 시그니처(매직 바이트)로 판별 */
export function sniffType(buf: Buffer): 'image/jpeg' | 'image/png' | 'application/pdf' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/** 증빙 저장소. 개발: 로컬 디스크(비공개 경로) / 운영: S3 비공개 버킷 + SSE-KMS (Phase 8에서 교체) */
@Injectable()
export class EvidenceStorage {
  private readonly dir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads', 'evidence');
  async save(userId: string, buf: Buffer): Promise<{ key: string; type: string }> {
    if (buf.length === 0 || buf.length > EVIDENCE_MAX_BYTES) throw new AppError('FILE_SIZE', '10MB 이하 파일만 올릴 수 있어요.');
    const type = sniffType(buf);
    if (!type) throw new AppError('FILE_TYPE', 'JPG, PNG, PDF 파일만 올릴 수 있어요.');
    const key = `evidence/${userId}/${randomUUID()}.${type === 'application/pdf' ? 'pdf' : type.split('/')[1]}`;
    await mkdir(join(this.dir, userId), { recursive: true });
    await writeFile(join(this.dir, key.replace('evidence/', '')), buf, { mode: 0o600 });
    return { key, type };
  }
}
