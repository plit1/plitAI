import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/** 모든 오류를 { code, message, details?, requestId } 형태로 통일. 내부 오류 상세는 노출하지 않는다. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { code: 'INTERNAL', message: '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      if (typeof r === 'object' && r && 'code' in r) body = r as Record<string, unknown>;
      else if (status === HttpStatus.BAD_REQUEST && typeof r === 'object' && r && 'message' in r) {
        body = { code: 'VALIDATION', message: '입력값을 확인해주세요.', details: (r as { message: unknown }).message };
      } else if (status === HttpStatus.UNAUTHORIZED) body = { code: 'UNAUTHORIZED', message: '로그인이 필요해요.' };
      else if (status === HttpStatus.FORBIDDEN) body = { code: 'FORBIDDEN', message: '권한이 없어요.' };
      else if (status === HttpStatus.NOT_FOUND) body = { code: 'NOT_FOUND', message: '요청한 리소스를 찾을 수 없어요.' };
      else if (status === HttpStatus.TOO_MANY_REQUESTS) body = { code: 'RATE_LIMITED', message: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.' };
      else body = { code: 'HTTP_' + status, message: exception.message };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      status = HttpStatus.CONFLICT;
      body = { code: 'DUPLICATE', message: '이미 처리된 요청이에요.' };
    }
    if (status >= 500) this.logger.error({ err: exception, path: req.url }, 'unhandled');
    res.status(status).json({ ...body, requestId: req.id });
  }
}
