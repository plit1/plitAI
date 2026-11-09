import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppError } from '../../common/errors';
import { OBJECT_STORAGE, ObjectStorage } from '../../common/storage/storage';

export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
/** 확장자·Content-Type 이 아니라 파일 시그니처(매직 바이트)로 판별 */
export function sniffType(buf: Buffer): 'image/jpeg' | 'image/png' | 'application/pdf' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/** 증빙 저장소: 형식·크기 검사 후 비공개 저장소(로컬/S3)에 보관 */
@Injectable()
export class EvidenceStorage {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}
  async save(userId: string, buf: Buffer): Promise<{ key: string; type: string }> {
    if (buf.length === 0 || buf.length > EVIDENCE_MAX_BYTES) throw new AppError('FILE_SIZE', '10MB 이하 파일만 올릴 수 있어요.');
    const type = sniffType(buf);
    if (!type) throw new AppError('FILE_TYPE', 'JPG, PNG, PDF 파일만 올릴 수 있어요.');
    const key = `evidence/${userId}/${randomUUID()}.${type === 'application/pdf' ? 'pdf' : type.split('/')[1]}`;
    await this.storage.put(key, buf, type);
    return { key, type };
  }
  read(key: string) { return this.storage.get(key); }
}
