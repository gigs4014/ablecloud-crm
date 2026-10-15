import { describe, expect, it } from 'vitest';
import { toIcs } from './synology-calendar.adapter';

describe('CalDAV 일정 변환', () => {
  it('종일 일정은 로컬 날짜로, 종료일은 다음 날로 표기', () => {
    const ics = toIcs('abc', {
      ownerId: null,
      title: '김민준 연차',
      startsAt: new Date('2026-10-22T15:00:00Z'),
      endsAt: new Date('2026-10-26T15:00:00Z'),
      allDay: true,
      dateRange: { start: '2026-10-23', end: '2026-10-26' },
      source: 'LEAVE',
    });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261023');
    expect(ics).toContain('DTEND;VALUE=DATE:20261027');
    expect(ics).toContain('SUMMARY:김민준 연차');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });

  it('시간 일정은 UTC, 특수문자 이스케이프', () => {
    const ics = toIcs('x', {
      ownerId: 'u',
      title: '회의; 준비, 자료',
      startsAt: new Date('2026-10-16T06:00:00Z'),
      endsAt: new Date('2026-10-16T07:00:00Z'),
      allDay: false,
      source: 'SUGGESTION',
    });
    expect(ics).toContain('DTSTART:20261016T060000Z');
    expect(ics).toContain('SUMMARY:회의\\; 준비\\, 자료');
  });
});
