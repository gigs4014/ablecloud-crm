import { BadRequestException } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

/** zod 스키마로 요청 본문을 검증하고, 실패하면 첫 번째 오류 메시지로 400을 돌려줍니다. */
export function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new BadRequestException(issue?.message ?? '요청 형식이 올바르지 않습니다.');
  }
  return result.data;
}
