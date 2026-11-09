import { Injectable, Logger } from '@nestjs/common';

/** 메일 발송 어댑터. 운영에서는 AWS SES 구현으로 교체 (Phase 8). 개발/테스트는 로그 + 메모리 보관. */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  readonly outbox: { to: string; subject: string; body: string }[] = [];
  async send(to: string, subject: string, body: string) {
    if (process.env.NODE_ENV !== 'production') {
      this.outbox.push({ to, subject, body });
      if (this.outbox.length > 100) this.outbox.shift();
      this.logger.log(`[DEV MAIL] to=${to} subject=${subject}`);
      return;
    }
    throw new Error('운영 메일 발송기(SES)가 아직 설정되지 않았어요.');
  }
}
