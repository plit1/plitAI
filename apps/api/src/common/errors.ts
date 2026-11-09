import { HttpException, HttpStatus } from '@nestjs/common';

/** 도메인 오류: 프런트에서 code 로 분기, message 는 사용자에게 그대로 노출 가능한 한국어 문구 */
export class AppError extends HttpException {
  constructor(public readonly code: string, message: string, status: HttpStatus = HttpStatus.BAD_REQUEST, public readonly details?: unknown) {
    super({ code, message, details }, status);
  }
}
export const NotFound = (what: string) => new AppError('NOT_FOUND', `${what}을(를) 찾을 수 없어요.`, HttpStatus.NOT_FOUND);
export const Forbidden = (code: string, message: string) => new AppError(code, message, HttpStatus.FORBIDDEN);
export const Conflict = (code: string, message: string) => new AppError(code, message, HttpStatus.CONFLICT);
