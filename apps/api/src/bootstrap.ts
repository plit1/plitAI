import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** main.ts 와 e2e 테스트가 같은 설정을 쓰도록 분리 */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: (process.env.APP_ORIGIN || 'http://localhost:3000').split(','), credentials: true });
  (app as NestExpressApplication).useBodyParser('json', { limit: '1.1mb' }); // CSV 일괄 등록(1MB) 수용
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const http = app.getHttpAdapter().getInstance();
  // 앞단 프록시 수 (스테이징: CloudFront → Caddy = 2). 실제 접속 IP 를 X-Forwarded-For 에서 읽는다
  http.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  http.disable('x-powered-by');
  return app;
}
