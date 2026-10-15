import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, scheduleSuggestions, type Database, type ScheduleSuggestion } from '@erm/db';
import type { ScheduleSuggestionDecisionInput, ScheduleSuggestionDto } from '@erm/shared';
import type { AuthUser } from '../../common/auth';
import { DB } from '../../infra/tokens';
import { CALENDAR, type CalendarPort } from '../ports';

function toDto(s: ScheduleSuggestion): ScheduleSuggestionDto {
  return {
    id: s.id,
    sourceLabel: s.sourceLabel,
    quote: s.quote,
    title: s.title,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    participants: s.participants,
    status: s.status,
  };
}

/**
 * 대화에서 찾은 일정 후보. 사용자가 확인(등록/무시)해야 캘린더에 들어갑니다.
 * 후보 생성(대화 수집 → LLM 추출)은 2차 개발에서 worker가 담당합니다.
 */
@Injectable()
export class ScheduleService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CALENDAR) private readonly calendar: CalendarPort,
  ) {}

  async listPending(user: AuthUser): Promise<ScheduleSuggestionDto[]> {
    const rows = await this.db
      .select()
      .from(scheduleSuggestions)
      .where(
        and(
          eq(scheduleSuggestions.tenantId, user.tenantId),
          eq(scheduleSuggestions.userId, user.userId),
          eq(scheduleSuggestions.status, 'PENDING'),
        ),
      )
      .orderBy(asc(scheduleSuggestions.startsAt));
    return rows.map(toDto);
  }

  async decide(user: AuthUser, id: string, input: ScheduleSuggestionDecisionInput): Promise<ScheduleSuggestionDto> {
    const [existing] = await this.db
      .select()
      .from(scheduleSuggestions)
      .where(
        and(
          eq(scheduleSuggestions.tenantId, user.tenantId),
          eq(scheduleSuggestions.userId, user.userId),
          eq(scheduleSuggestions.id, id),
        ),
      );
    if (!existing) throw new NotFoundException('일정 후보를 찾을 수 없습니다.');
    if (existing.status !== 'PENDING') throw new ConflictException('이미 처리된 일정 후보입니다.');

    const title = input.title ?? existing.title;
    const startsAt = input.startsAt ? new Date(input.startsAt) : existing.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : existing.endsAt;

    const [updated] = await this.db
      .update(scheduleSuggestions)
      .set({
        status: input.decision === 'ACCEPT' ? 'ACCEPTED' : 'DISMISSED',
        decidedAt: new Date(),
        title,
        startsAt,
        endsAt,
      })
      .where(and(eq(scheduleSuggestions.id, id), eq(scheduleSuggestions.status, 'PENDING')))
      .returning();
    if (!updated) throw new ConflictException('이미 처리된 일정 후보입니다.');

    if (input.decision === 'ACCEPT') {
      await this.calendar.createEvent(
        { tenantId: user.tenantId },
        { ownerId: user.userId, title, startsAt, endsAt, allDay: false, source: 'SUGGESTION', sourceRef: id },
      );
    }
    return toDto(updated);
  }
}
