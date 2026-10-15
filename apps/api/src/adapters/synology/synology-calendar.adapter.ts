import { Inject, Injectable, Logger } from '@nestjs/common';
import { addDays, type CalendarEventDto } from '@erm/shared';
import { APP_CONFIG, type AppConfig } from '../../config';
import type { CalendarEventInput, CalendarPort, TenantScope } from '../../core/ports';
import { InternalCalendarAdapter } from '../internal/internal-calendar.adapter';

/** iCalendar 텍스트 값 이스케이프 (RFC 5545) */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function formatUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const compactDate = (isoDate: string) => isoDate.replace(/-/g, '');

export function toIcs(uid: string, input: CalendarEventInput): string {
  const timing =
    input.allDay && input.dateRange
      ? [
          `DTSTART;VALUE=DATE:${compactDate(input.dateRange.start)}`,
          // iCalendar 종일 일정의 종료일은 다음 날(미포함)로 표기합니다.
          `DTEND;VALUE=DATE:${compactDate(addDays(input.dateRange.end, 1))}`,
        ]
      : [`DTSTART:${formatUtc(input.startsAt)}`, `DTEND:${formatUtc(input.endsAt)}`];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ERM//Portal//KO',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatUtc(new Date())}`,
    ...timing,
    `SUMMARY:${escapeText(input.title)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/**
 * 자체 DB에 저장한 뒤, 시놀로지 Calendar에도 CalDAV(PUT)로 등록합니다.
 * SYNOLOGY_CALDAV_URL은 대상 캘린더 컬렉션 주소입니다 (DSM Calendar의 CalDAV 계정 정보에서 확인).
 * 포털 화면은 자체 DB를 읽기 때문에, 시놀로지 연결이 끊겨도 서비스는 계속 동작합니다.
 * 실환경 DSM 버전에서 한 번 검증이 필요합니다.
 */
@Injectable()
export class SynologyCalendarAdapter implements CalendarPort {
  private readonly logger = new Logger(SynologyCalendarAdapter.name);

  constructor(
    private readonly internal: InternalCalendarAdapter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private eventUrl(ref: string): string | null {
    const base = this.config.synology.caldavUrl;
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/${encodeURIComponent(ref)}.ics`;
  }

  private authHeader(): Record<string, string> {
    const { caldavUsername: u, caldavPassword: p } = this.config.synology;
    return u && p ? { Authorization: `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}` } : {};
  }

  async createEvent(scope: TenantScope, input: CalendarEventInput): Promise<{ ref: string }> {
    const result = await this.internal.createEvent(scope, input);
    const url = this.eventUrl(result.ref);
    if (url) {
      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/calendar; charset=utf-8', ...this.authHeader() },
          body: toIcs(result.ref, input),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) this.logger.warn(`CalDAV 등록 실패: HTTP ${res.status}`);
      } catch (e) {
        this.logger.warn(`CalDAV 등록 실패: ${(e as Error).message}`);
      }
    }
    return result;
  }

  async deleteEvent(scope: TenantScope, ref: string): Promise<void> {
    await this.internal.deleteEvent(scope, ref);
    const url = this.eventUrl(ref);
    if (!url) return;
    try {
      await fetch(url, { method: 'DELETE', headers: this.authHeader(), signal: AbortSignal.timeout(8000) });
    } catch (e) {
      this.logger.warn(`CalDAV 삭제 실패: ${(e as Error).message}`);
    }
  }

  listEvents(scope: TenantScope, q: { userId: string; from: Date; to: Date }): Promise<CalendarEventDto[]> {
    return this.internal.listEvents(scope, q);
  }
}
