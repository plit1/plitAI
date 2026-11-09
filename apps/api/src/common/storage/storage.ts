import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join, normalize, sep } from 'path';

/** 비공개 파일 저장소 (합격 증빙 등 개인정보 파일). 공개 URL 을 만들지 않고 서버를 통해서만 내려준다. */
export interface ObjectStorage {
  readonly driver: 'local' | 's3';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/** 키 형식 검증: 경로 탈출(.., 절대경로) 차단 */
export function assertSafeKey(key: string) {
  if (!/^[a-z]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(key) || key.includes('..')) throw new Error(`unsafe storage key: ${key}`);
}

export class LocalStorage implements ObjectStorage {
  readonly driver = 'local' as const;
  private readonly types = new Map<string, string>();
  constructor(private readonly root: string) {}
  private path(key: string) {
    assertSafeKey(key);
    const p = normalize(join(this.root, key));
    if (!p.startsWith(normalize(this.root) + sep)) throw new Error('path escape');
    return p;
  }
  async put(key: string, body: Buffer, contentType: string) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body, { mode: 0o600 });
    await writeFile(`${p}.type`, contentType, { mode: 0o600 });
  }
  async get(key: string) {
    const p = this.path(key);
    try { return { body: await readFile(p), contentType: (await readFile(`${p}.type`, 'utf8').catch(() => 'application/octet-stream')).trim() }; }
    catch { return null; }
  }
  async delete(key: string) { const p = this.path(key); await rm(p, { force: true }); await rm(`${p}.type`, { force: true }); }
}

/** S3 비공개 버킷. 서버측 암호화(SSE-KMS, 키 미지정 시 aws/s3 관리키) 요청 */
export class S3Storage implements ObjectStorage {
  readonly driver = 's3' as const;
  constructor(private readonly client: S3Client, private readonly bucket: string, private readonly kmsKeyId?: string) {}
  async put(key: string, body: Buffer, contentType: string) {
    assertSafeKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: 'aws:kms', ...(this.kmsKeyId ? { SSEKMSKeyId: this.kmsKeyId } : {}) }));
  }
  async get(key: string) {
    assertSafeKey(key);
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!r.Body) return null;
      return { body: Buffer.from(await r.Body.transformToByteArray()), contentType: r.ContentType ?? 'application/octet-stream' };
    } catch (e) {
      if ((e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  }
  async delete(key: string) { assertSafeKey(key); await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }
}

export function createStorage(env: { STORAGE_DRIVER?: string; S3_UPLOAD_BUCKET?: string; AWS_REGION?: string; S3_KMS_KEY_ID?: string; UPLOAD_DIR?: string }): ObjectStorage {
  if (env.STORAGE_DRIVER === 's3') {
    if (!env.S3_UPLOAD_BUCKET) throw new Error('STORAGE_DRIVER=s3 인데 S3_UPLOAD_BUCKET 이 없습니다.');
    return new S3Storage(new S3Client({ region: env.AWS_REGION || 'ap-northeast-2' }), env.S3_UPLOAD_BUCKET, env.S3_KMS_KEY_ID);
  }
  return new LocalStorage(env.UPLOAD_DIR || join(process.cwd(), 'uploads'));
}
