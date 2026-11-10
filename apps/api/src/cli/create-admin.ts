/**
 * 최초 최고관리자 생성 (스테이징·운영 서버에서 운영자가 직접 실행).
 *   node dist/cli/create-admin.js --email you@company.kr [--nickname 플릿관리자] [--allow-additional]
 *
 * - 이메일·비밀번호를 소스코드나 환경변수에 넣지 않는다. 이메일은 실행할 때 입력하고,
 *   비밀번호는 서버가 무작위 임시 비밀번호를 만들어 이 화면에 단 한 번 보여준다 (DB 에는 bcrypt 해시만 저장).
 * - 첫 로그인 시 비밀번호 변경 강제(passwordChangeRequired) → 2단계 인증(OTP) 등록 후에만 관리자 기능 사용(ADMIN_MFA_REQUIRED).
 * - 이미 최고관리자가 있으면 거부 (--allow-additional 로만 추가). 이미 가입한 이메일은 거부 (기존 회원 승격은 관리자 화면에서).
 * - 실행 기록은 감사 로그(ADMIN_BOOTSTRAP)에 남는다.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { referralCode } from '../common/crypto';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function tempPassword(len = 20) {
  // 영문 대소문자 + 숫자 보장 (PASSWORD_RULE 충족), 혼동 문자(0/O/1/l/I) 제외
  for (;;) {
    const p = Array.from(randomBytes(len), (b) => ALPHA[b % ALPHA.length]).join('');
    if (/[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p)) return p;
  }
}

export interface AdminArgs { email: string; nickname: string; allowAdditional: boolean }
export function parseArgs(argv: string[]): AdminArgs {
  const out: { email?: string; nickname: string; allowAdditional: boolean } = { nickname: '플릿관리자', allowAdditional: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--email') out.email = argv[++i]?.trim();
    else if (argv[i] === '--nickname') out.nickname = argv[++i];
    else if (argv[i] === '--allow-additional') out.allowAdditional = true;
    else throw new Error(`알 수 없는 옵션: ${argv[i]}`);
  }
  if (!out.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new Error('사용법: create-admin --email 관리자이메일 [--nickname 이름]');
  if (out.nickname.length < 2 || out.nickname.length > 12) throw new Error('닉네임은 2~12자여야 해요.');
  return { ...out, email: out.email.trim().toLowerCase() };
}

export async function createAdmin(prisma: PrismaClient, args: AdminArgs) {
  const supers = await prisma.user.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } });
  if (supers > 0 && !args.allowAdditional) throw new Error(`이미 최고관리자가 ${supers}명 있어요. 추가가 정말 필요하면 --allow-additional 을 붙여 다시 실행하세요.`);
  if (await prisma.user.findUnique({ where: { email: args.email } })) throw new Error('이미 가입된 이메일이에요. 기존 회원의 권한 변경은 관리자 화면에서 하세요.');
  const password = tempPassword();
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.$transaction(async (tx) => {
    let code = referralCode();
    while (await tx.user.findUnique({ where: { referralCode: code } })) code = referralCode();
    const u = await tx.user.create({ data: { email: args.email, nickname: args.nickname, passwordHash, role: 'SUPER_ADMIN', emailVerified: true, passwordChangeRequired: true, referralCode: code } });
    await tx.authIdentity.create({ data: { userId: u.id, provider: 'EMAIL', providerUserId: args.email, email: args.email } });
    await tx.adminAuditLog.create({ data: { actorId: u.id, action: 'ADMIN_BOOTSTRAP', targetType: 'User', targetId: u.id, after: { email: args.email, via: 'cli', additional: supers > 0 } } });
    return u;
  });
  return { user, password };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const { user, password } = await createAdmin(prisma, args);
    console.log('\n최고관리자 계정을 만들었어요.');
    console.log(`  이메일        : ${user.email}`);
    console.log(`  임시 비밀번호 : ${password}`);
    console.log('\n※ 이 비밀번호는 지금 한 번만 표시돼요. 바로 로그인해서 새 비밀번호로 바꾸고, 2단계 인증(OTP)을 등록하세요.');
    console.log('※ 이 화면을 캡처·공유하거나 메신저로 보내지 마세요.\n');
  } finally { await prisma.$disconnect(); }
}

if (require.main === module) main().catch((e) => { console.error(`실패: ${(e as Error).message}`); process.exit(1); });
