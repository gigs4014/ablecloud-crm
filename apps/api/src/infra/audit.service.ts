import { Inject, Injectable } from '@nestjs/common';
import { auditLogs, type Database } from '@erm/db';
import { DB } from './tokens';

export interface AuditEntry {
  tenantId: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/** 근태 정정, 휴가 결재, 개인정보 조회 같은 민감한 동작을 기록합니다. */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLogs).values({
      tenantId: entry.tenantId,
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.ip ?? null,
    });
  }
}
