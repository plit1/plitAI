import { Global, Injectable, Module } from '@nestjs/common';
import { Tx } from '../../common/prisma.service';
import { stageForXp } from './gx.rules';

export interface XpEvent { eventKey: string; sourceType: 'study' | 'test' | 'streak' | 'clear' | 'weekly'; sourceId: string; deltaXp: number }

/**
 * XP 원장 단일 진입점 (경제적 가치 없음 — 포인트와 분리).
 * eventKey 중복은 건너뛰고, 레벨이 오르면 같은 트랜잭션에서 진화 기록(레벨당 1회).
 */
@Injectable()
export class XpService {
  async award(tx: Tx, userId: string, events: XpEvent[]) {
    const before = await this.totals(tx, userId);
    let awarded = 0;
    for (const e of events) {
      const xp = Math.max(0, Math.floor(e.deltaXp));
      if (xp <= 0) continue;
      const r = await tx.xpLedgerEntry.createMany({ data: [{ userId, deltaXp: xp, sourceType: e.sourceType, sourceId: e.sourceId, eventKey: e.eventKey }], skipDuplicates: true });
      if (r.count) awarded += xp;
    }
    if (!awarded) return { awarded: 0, levelBefore: before.level, levelAfter: before.level };
    const after = await this.totals(tx, userId);
    const trigger = events[events.length - 1]?.sourceType ?? 'study';
    for (let lv = before.level + 1; lv <= after.level; lv++) {
      await tx.petEvolution.createMany({ data: [{ userId, level: lv, trigger }], skipDuplicates: true });
    }
    return { awarded, levelBefore: before.level, levelAfter: after.level };
  }

  async totals(db: Tx, userId: string) {
    const [sum, clears] = await Promise.all([
      db.xpLedgerEntry.aggregate({ where: { userId }, _sum: { deltaXp: true } }),
      db.xpLedgerEntry.count({ where: { userId, sourceType: 'clear' } }),
    ]);
    const total = sum._sum.deltaXp ?? 0;
    return { total, clears, level: stageForXp(total, clears) };
  }
}

@Global()
@Module({ providers: [XpService], exports: [XpService] })
export class XpModule {}
