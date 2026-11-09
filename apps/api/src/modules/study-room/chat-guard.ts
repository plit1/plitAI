import { checkText } from '../../common/text-filter';

/** 데모 SR_POLICY 그대로 */
export const SR_POLICY = { maxLen: 300, minIntervalMs: 2000, burstWindowMs: 30_000, burstMax: 5, strikeWindowMs: 60_000, strikeMax: 3, cooldownMs: 60_000, duplicateMs: 30_000 };

interface UserState { sends: number[]; strikes: number[]; cooldownUntil: number; lastBody?: string; lastRoom?: string; lastAt?: number }
export type GuardResult = { ok: true; text: string } | { ok: false; code: string; message: string };

/**
 * 채팅 전송 가드 (사용자 단위, 프로세스 메모리).
 * 순서: 쿨다운 → 중복 → 길이 → 필터(위반 누적 시 쿨다운) → 간격 → 버스트.
 * ⚠ 다중 인스턴스에서는 인스턴스별로 계산됨 → Redis 저장소로 교체 필요 (development-progress 참고)
 */
export class ChatGuard {
  private readonly users = new Map<string, UserState>();
  constructor(private readonly now: () => number = Date.now) {}

  check(userId: string, roomId: string, raw: unknown): GuardResult {
    const t = this.now();
    const s = this.users.get(userId) ?? { sends: [], strikes: [], cooldownUntil: 0 };
    this.users.set(userId, s);
    if (s.cooldownUntil > t) return { ok: false, code: 'COOLDOWN', message: `필터 위반이 반복돼 ${Math.ceil((s.cooldownUntil - t) / 1000)}초 동안 작성이 잠시 제한돼요.` };
    const body = String(raw ?? '').trim();
    if (body && s.lastBody === body && s.lastRoom === roomId && t - (s.lastAt ?? 0) < SR_POLICY.duplicateMs) return { ok: false, code: 'DUPLICATE', message: '같은 메시지를 연달아 보낼 수 없어요. 내용을 바꾸거나 잠시 후 보내주세요.' };
    if (body.length > SR_POLICY.maxLen) return { ok: false, code: 'LENGTH', message: `${SR_POLICY.maxLen}자 이하로 입력해주세요. (현재 ${body.length}자)` };
    const chk = checkText(body);
    if (!chk.ok) {
      if (chk.code !== 'EMPTY') {
        s.strikes = s.strikes.filter((x) => t - x < SR_POLICY.strikeWindowMs).concat(t);
        if (s.strikes.length >= SR_POLICY.strikeMax) { s.cooldownUntil = t + SR_POLICY.cooldownMs; s.strikes = []; }
      }
      return { ok: false, code: chk.code, message: chk.message };
    }
    s.sends = s.sends.filter((x) => t - x < SR_POLICY.burstWindowMs);
    const last = s.sends[s.sends.length - 1];
    if (last && t - last < SR_POLICY.minIntervalMs) return { ok: false, code: 'RATE', message: '너무 빠르게 보내고 있어요. 잠시 후 다시 보내주세요.' };
    if (s.sends.length >= SR_POLICY.burstMax) return { ok: false, code: 'BURST', message: `30초에 ${SR_POLICY.burstMax}개까지 보낼 수 있어요.` };
    s.sends.push(t); s.lastBody = body; s.lastRoom = roomId; s.lastAt = t;
    return { ok: true, text: chk.text };
  }
}
