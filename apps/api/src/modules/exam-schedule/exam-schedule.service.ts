import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../admin/audit.service';
import { ExamRoundInput, kstDay, parseRoundsCsv, validateRound } from './exam-schedule.parser';

/**
 * 시험 일정 관리. 출처: MANUAL(관리자 입력) · CSV(일괄 등록) · 공공데이터 API(연동 대기).
 * 공공데이터포털 큐넷 시험일정 API 는 명세·키 확인 전이라 자동 동기화를 하지 않는다 (decisions D-017).
 */
@Injectable()
export class ExamScheduleService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly config: ConfigService) {}

  providers() {
    return [
      { id: 'MANUAL', name: '관리자 직접 입력', status: 'ACTIVE' },
      { id: 'CSV', name: 'CSV 일괄 등록', status: 'ACTIVE' },
      {
        id: 'QNET_API', name: '공공데이터포털 · 한국산업인력공단 국가자격 시험일정',
        status: this.config.get('QNET_SERVICE_KEY') ? 'PENDING_SPEC' : 'NOT_CONFIGURED',
        note: '응답 명세 확인 및 서비스 키 발급 후 어댑터 구현 예정 — 현재 호출하지 않음',
      },
    ];
  }

  list(certId?: string) {
    return this.prisma.examRound.findMany({ where: certId ? { certId } : {}, orderBy: [{ examDate: 'asc' }], include: { cert: { select: { name: true } } }, take: 500 });
  }

  private data(r: ExamRoundInput, source: string) {
    const d = (v?: string | null) => (v ? kstDay(v) : null);
    return { applyStart: d(r.applyStart), applyEnd: d(r.applyEnd), examDate: kstDay(r.examDate), resultDate: d(r.resultDate), source, sourceUpdatedAt: new Date() };
  }

  async upsertOne(adminId: string, r: ExamRoundInput, ip?: string) {
    const certs = new Set((await this.prisma.certification.findMany({ select: { id: true } })).map((c) => c.id));
    const err = validateRound(r, certs);
    if (err) throw new AppError('INVALID_EXAM_ROUND', err);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.examRound.findUnique({ where: { certId_label: { certId: r.certId, label: r.label } } });
      const row = await tx.examRound.upsert({ where: { certId_label: { certId: r.certId, label: r.label } }, create: { certId: r.certId, label: r.label, ...this.data(r, 'MANUAL') }, update: this.data(r, 'MANUAL') });
      await this.audit.log(tx, { actorId: adminId, action: before ? 'EXAM_ROUND_UPDATE' : 'EXAM_ROUND_CREATE', targetType: 'ExamRound', targetId: row.id, before, after: row, ip });
      return row;
    });
  }

  async remove(adminId: string, id: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.examRound.findUnique({ where: { id } });
      if (!before) throw NotFound('시험 회차');
      await tx.examRound.delete({ where: { id } });
      await this.audit.log(tx, { actorId: adminId, action: 'EXAM_ROUND_DELETE', targetType: 'ExamRound', targetId: id, before, ip });
    });
  }

  /** CSV 일괄 등록. dryRun=true 면 DB 를 바꾸지 않고 생성/수정/오류 미리보기만 반환. 오류가 1건이라도 있으면 반영 거부. */
  async importCsv(adminId: string, csv: string, dryRun: boolean, ip?: string) {
    if (csv.length > 1_000_000) throw new AppError('CSV_TOO_LARGE', 'CSV 는 1MB 이하로 올려주세요.', HttpStatus.PAYLOAD_TOO_LARGE);
    const certs = new Set((await this.prisma.certification.findMany({ select: { id: true } })).map((c) => c.id));
    const { valid, errors } = parseRoundsCsv(csv, certs);
    const existing = await this.prisma.examRound.findMany({ where: { OR: valid.map((v) => ({ certId: v.certId, label: v.label })) }, select: { certId: true, label: true } });
    const has = new Set(existing.map((e) => `${e.certId}|${e.label}`));
    const summary = { total: valid.length + errors.length, create: valid.filter((v) => !has.has(`${v.certId}|${v.label}`)).length, update: valid.filter((v) => has.has(`${v.certId}|${v.label}`)).length, errors };
    if (dryRun || errors.length) return { ...summary, applied: false };
    await this.prisma.$transaction(async (tx) => {
      for (const v of valid) {
        await tx.examRound.upsert({ where: { certId_label: { certId: v.certId, label: v.label } }, create: { certId: v.certId, label: v.label, ...this.data(v, 'CSV') }, update: this.data(v, 'CSV') });
      }
      await this.audit.log(tx, { actorId: adminId, action: 'EXAM_ROUND_IMPORT', targetType: 'ExamRound', targetId: 'csv', after: { create: summary.create, update: summary.update }, ip });
    });
    return { ...summary, applied: true };
  }
}
