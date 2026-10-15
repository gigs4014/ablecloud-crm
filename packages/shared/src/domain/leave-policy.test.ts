import { describe, expect, it } from 'vitest';
import {
  annualLeaveForServiceYears,
  calculateLeaveDays,
  completedMonths,
  countWorkingDays,
  currentLeavePeriod,
} from './leave-policy';
import { addMonths, zonedTimeToUtc } from './dates';
import { ipInCidr, isAllowedNetwork } from './network';
import { workedMinutes } from './attendance';

describe('근속 연수별 연차', () => {
  it.each([
    [0, 0],
    [1, 15],
    [2, 15],
    [3, 16],
    [4, 16],
    [5, 17],
    [10, 19],
    [21, 25],
    [30, 25],
  ])('%i년 → %i일', (years, days) => {
    expect(annualLeaveForServiceYears(years)).toBe(days);
  });
});

describe('입사일 기준 연차 기간', () => {
  it('1년 미만은 개월 수만큼, 최대 11일', () => {
    expect(currentLeavePeriod('2026-03-02', '2026-10-15')).toEqual({
      periodStart: '2026-03-02',
      periodEnd: '2027-03-01',
      granted: 7,
      isFirstYear: true,
    });
    expect(currentLeavePeriod('2025-10-16', '2026-10-15').granted).toBe(11);
  });

  it('입사 1년이 되는 날 15일 발생', () => {
    expect(currentLeavePeriod('2025-10-15', '2026-10-15')).toEqual({
      periodStart: '2026-10-15',
      periodEnd: '2027-10-14',
      granted: 15,
      isFirstYear: false,
    });
  });

  it('3년차부터 가산', () => {
    expect(currentLeavePeriod('2023-01-02', '2026-10-15').granted).toBe(16);
  });

  it('월말 입사자의 개월 계산', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(completedMonths('2026-01-31', '2026-02-27')).toBe(0);
    expect(completedMonths('2026-01-31', '2026-02-28')).toBe(1);
  });
});

describe('휴가 일수 계산', () => {
  it('주말 제외', () => {
    // 2026-10-23 금 ~ 10-26 월
    expect(countWorkingDays('2026-10-23', '2026-10-26')).toBe(2);
  });

  it('공휴일 제외', () => {
    expect(countWorkingDays('2026-10-05', '2026-10-09', new Set(['2026-10-09']))).toBe(4);
  });

  it('반차와 반반차', () => {
    expect(calculateLeaveDays('HALF_AM', '2026-10-21', '2026-10-21')).toBe(0.5);
    expect(calculateLeaveDays('QUARTER', '2026-10-21', '2026-10-21')).toBe(0.25);
    expect(calculateLeaveDays('HALF_PM', '2026-10-24', '2026-10-24')).toBe(0);
    expect(() => calculateLeaveDays('HALF_PM', '2026-10-21', '2026-10-22')).toThrow();
  });
});

describe('시간대 변환', () => {
  it('서울 자정은 전날 15시 UTC', () => {
    expect(zonedTimeToUtc('2026-10-15', '00:00', 'Asia/Seoul').toISOString()).toBe('2026-10-14T15:00:00.000Z');
  });
  it('서머타임 지역도 처리', () => {
    expect(zonedTimeToUtc('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(zonedTimeToUtc('2026-12-01', '09:00', 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });
});

describe('근무 시간 계산', () => {
  const t = (hhmm: string) => new Date(`2026-10-15T${hhmm}:00+09:00`);
  it('09:00~18:00 은 휴게 1시간 빼고 8시간', () => {
    expect(workedMinutes(t('09:00'), t('18:00'))).toBe(480);
  });
  it('4시간 근무는 휴게 없음, 6시간은 30분', () => {
    expect(workedMinutes(t('09:00'), t('13:00'))).toBe(240);
    expect(workedMinutes(t('09:00'), t('15:00'))).toBe(330);
  });
  it('근무 시간은 시간이 지날수록 줄어들지 않음', () => {
    let prev = 0;
    for (let m = 0; m <= 12 * 60; m += 5) {
      const v = workedMinutes(t('09:00'), new Date(t('09:00').getTime() + m * 60000));
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('사내 네트워크 확인', () => {
  it('CIDR 매칭', () => {
    expect(ipInCidr('192.168.10.25', '192.168.10.0/24')).toBe(true);
    expect(ipInCidr('::ffff:192.168.10.25', '192.168.10.0/24')).toBe(true);
    expect(ipInCidr('192.168.11.1', '192.168.10.0/24')).toBe(false);
    expect(ipInCidr('10.0.0.1', '10.0.0.1')).toBe(true);
  });

  it('허용 목록이 비어 있으면 제한 없음', () => {
    expect(isAllowedNetwork(undefined, [])).toBe(true);
    expect(isAllowedNetwork(undefined, ['10.0.0.0/8'])).toBe(false);
  });
});
