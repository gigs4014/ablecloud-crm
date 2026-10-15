import { Inject, Injectable } from '@nestjs/common';
import { and, asc, calendarEvents, eq, gt, isNull, lt, or, type Database } from '@erm/db';
import type { CalendarEventDto } from '@erm/shared';
import { DB } from '../../infra/tokens';
import type { CalendarEventInput, CalendarPort, TenantScope } from '../../core/ports';

/** 외부 캘린더 없이 자체 DB에 일정을 저장하는 어댑터 */
@Injectable()
export class InternalCalendarAdapter implements CalendarPort {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createEvent(scope: TenantScope, input: CalendarEventInput): Promise<{ ref: string }> {
    const [row] = await this.db
      .insert(calendarEvents)
      .values({
        tenantId: scope.tenantId,
        ownerId: input.ownerId,
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        allDay: input.allDay,
        source: input.source,
        sourceRef: input.sourceRef ?? null,
      })
      .returning({ id: calendarEvents.id });
    return { ref: row.id };
  }

  async deleteEvent(scope: TenantScope, ref: string): Promise<void> {
    await this.db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.tenantId, scope.tenantId), eq(calendarEvents.id, ref)));
  }

  async listEvents(scope: TenantScope, q: { userId: string; from: Date; to: Date }): Promise<CalendarEventDto[]> {
    const rows = await this.db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.tenantId, scope.tenantId),
          or(eq(calendarEvents.ownerId, q.userId), isNull(calendarEvents.ownerId)),
          lt(calendarEvents.startsAt, q.to),
          gt(calendarEvents.endsAt, q.from),
        ),
      )
      .orderBy(asc(calendarEvents.allDay), asc(calendarEvents.startsAt));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      allDay: r.allDay,
      source: r.source,
    }));
  }
}
