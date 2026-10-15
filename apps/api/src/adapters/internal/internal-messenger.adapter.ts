import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, notifications, type Database } from '@erm/db';
import type { NotificationDto } from '@erm/shared';
import { DB } from '../../infra/tokens';
import type { MessengerPort, NotifyInput, TenantScope } from '../../core/ports';

/** 포털 안의 알림함에 저장하는 어댑터 */
@Injectable()
export class InternalMessengerAdapter implements MessengerPort {
  constructor(@Inject(DB) private readonly db: Database) {}

  async notify(scope: TenantScope, userId: string, input: NotifyInput): Promise<void> {
    await this.db.insert(notifications).values({
      tenantId: scope.tenantId,
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    });
  }

  async listForUser(scope: TenantScope, userId: string, limit: number): Promise<NotificationDto[]> {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.tenantId, scope.tenantId), eq(notifications.userId, userId)))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      link: r.link,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async markRead(scope: TenantScope, userId: string, ids: string[]): Promise<void> {
    const conditions = [
      eq(notifications.tenantId, scope.tenantId),
      eq(notifications.userId, userId),
      isNull(notifications.readAt),
    ];
    if (ids.length > 0) conditions.push(inArray(notifications.id, ids));
    await this.db.update(notifications).set({ readAt: new Date() }).where(and(...conditions));
  }
}
