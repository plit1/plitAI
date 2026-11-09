import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { sdkStreamMixin } from '@smithy/util-stream';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { assertSafeKey, LocalStorage, S3Storage } from './storage';

describe('저장소 키 검증', () => {
  it.each(['../etc/passwd', 'evidence/../x/y', '/abs/a/b', 'evidence/u1', 'evidence/u 1/a.png'])('거절: %s', (k) => expect(() => assertSafeKey(k)).toThrow());
  it('허용: evidence/{user}/{uuid}.png', () => expect(() => assertSafeKey('evidence/cmabc_1/1e2f-3.png')).not.toThrow());
});

describe('LocalStorage', () => {
  it('저장·조회(타입 보존)·삭제, 없는 키 null', async () => {
    const s = new LocalStorage(mkdtempSync(join(tmpdir(), 'plit-st-')));
    await s.put('evidence/u1/a.png', Buffer.from([1, 2, 3]), 'image/png');
    expect(await s.get('evidence/u1/a.png')).toEqual({ body: Buffer.from([1, 2, 3]), contentType: 'image/png' });
    await s.delete('evidence/u1/a.png');
    expect(await s.get('evidence/u1/a.png')).toBeNull();
  });
});

describe('S3Storage (aws-sdk-client-mock — 실제 S3 아님)', () => {
  const s3 = mockClient(S3Client);
  beforeEach(() => s3.reset());
  it('업로드 시 SSE-KMS·Content-Type·키 전달, 조회·삭제 명령', async () => {
    s3.on(PutObjectCommand).resolves({});
    s3.on(GetObjectCommand).resolves({ Body: sdkStreamMixin(Readable.from([Buffer.from('pdf')])), ContentType: 'application/pdf' });
    s3.on(DeleteObjectCommand).resolves({});
    const st = new S3Storage(new S3Client({ region: 'ap-northeast-2' }), 'plit-staging-uploads', 'kms-key-1');
    await st.put('evidence/u1/a.pdf', Buffer.from('pdf'), 'application/pdf');
    expect(s3.commandCalls(PutObjectCommand)[0].args[0].input).toMatchObject({ Bucket: 'plit-staging-uploads', Key: 'evidence/u1/a.pdf', ContentType: 'application/pdf', ServerSideEncryption: 'aws:kms', SSEKMSKeyId: 'kms-key-1' });
    expect(await st.get('evidence/u1/a.pdf')).toEqual({ body: Buffer.from('pdf'), contentType: 'application/pdf' });
    await st.delete('evidence/u1/a.pdf');
    expect(s3.commandCalls(DeleteObjectCommand)).toHaveLength(1);
    await expect(st.put('../x', Buffer.from(''), 'x')).rejects.toThrow();
  });
  it('없는 객체는 null', async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error('nope'), { name: 'NoSuchKey' }));
    const st = new S3Storage(new S3Client({ region: 'ap-northeast-2' }), 'b');
    expect(await st.get('evidence/u1/none.png')).toBeNull();
  });
});
