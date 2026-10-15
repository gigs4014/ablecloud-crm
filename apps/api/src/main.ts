import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 웹(Next.js) 프록시가 넘겨준 실제 접속 IP를 읽기 위해 설정합니다. (출근 시 사내 네트워크 확인용)
  // API를 웹 프록시 외의 경로로 직접 노출하지 마세요.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.use(cookieParser());
  app.enableShutdownHooks();
  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  Logger.log(`API 서버 시작: http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
