import { addDays, addMonths, addYears, compareIsoDate, isWeekend } from './dates';

export const LEAVE_TYPES = ['ANNUAL', 'HALF_AM', 'HALF_PM', 'QUARTER', 'SICK', 'FAMILY_EVENT'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  ANNUAL: '연차',
  HALF_AM: '오전 반차',
  HALF_PM: '오후 반차',
  QUARTER: '반반차',
  SICK: '병가',
  FAMILY_EVENT: '경조사',
};

/** 연차에서 차감되는 휴가 종류 */
export const DEDUCTIBLE_LEAVE_TYPES: ReadonlySet<LeaveType> = new Set(['ANNUAL', 'HALF_AM', 'HALF_PM', 'QUARTER']);

/** 하루 안에서만 쓰는 휴가 종류와 차감 일수 */
const PARTIAL_DAY_UNITS: Partial<Record<LeaveType, number>> = {
  HALF_AM: 0.5,
  HALF_PM: 0.5,
  QUARTER: 0.25,
};

export function isPartialDay(type: LeaveType): boolean {
  return PARTIAL_DAY_UNITS[type] !== undefined;
}

/** 시작일~종료일(포함) 중 주말과 공휴일을 뺀 근무일 수 */
export function countWorkingDays(startDate: string, endDate: string, holidays: ReadonlySet<string> = new Set()): number {
  if (compareIsoDate(startDate, endDate) > 0) return 0;
  let count = 0;
  for (let d = startDate; compareIsoDate(d, endDate) <= 0; d = addDays(d, 1)) {
    if (!isWeekend(d) && !holidays.has(d)) count += 1;
  }
  return count;
}

/** 휴가 신청 시 사용 일수 계산 */
export function calculateLeaveDays(
  type: LeaveType,
  startDate: string,
  endDate: string,
  holidays: ReadonlySet<string> = new Set(),
): number {
  const unit = PARTIAL_DAY_UNITS[type];
  if (unit !== undefined) {
    if (startDate !== endDate) {
      throw new Error('반차와 반반차는 하루만 신청할 수 있습니다.');
    }
    return countWorkingDays(startDate, endDate, holidays) === 1 ? unit : 0;
  }
  return countWorkingDays(startDate, endDate, holidays);
}

/** 입사일부터 기준일까지 완료한 개월 수 */
export function completedMonths(hireDate: string, asOf: string): number {
  let months = 0;
  while (compareIsoDate(addMonths(hireDate, months + 1), asOf) <= 0) months += 1;
  return months;
}

/** 입사일부터 기준일까지 완료한 근속 연수 */
export function completedYears(hireDate: string, asOf: string): number {
  let years = 0;
  while (compareIsoDate(addYears(hireDate, years + 1), asOf) <= 0) years += 1;
  return years;
}

/**
 * 근속 연수별 연차 일수 (근로기준법 제60조 기준, 출근율 80% 이상 가정)
 * - 1년 이상: 15일
 * - 3년 이상: 최초 1년을 초과하는 계속 근로 연수 매 2년마다 1일 가산, 최대 25일
 */
export function annualLeaveForServiceYears(years: number): number {
  if (years < 1) return 0;
  return Math.min(25, 15 + Math.floor((years - 1) / 2));
}

export interface LeavePeriod {
  /** 연차 산정 기간 시작일 (포함) */
  periodStart: string;
  /** 연차 산정 기간 종료일 (포함) */
  periodEnd: string;
  /** 기준일 시점까지 발생한 연차 일수 */
  granted: number;
  /** 1년 미만 근로자의 월 단위 연차 여부 */
  isFirstYear: boolean;
}

/**
 * 입사일 기준 연차 산정.
 * - 1년 미만: 1개월 개근 시 1일씩, 최대 11일 (입사 1년 시점까지 사용)
 * - 1년 이상: 매 입사 기념일에 근속 연수에 따른 일수 발생
 *
 * 회계연도 기준 운영, 출근율 80% 미만, 결근 처리 등은 회사 정책에 따라 별도 보정이 필요합니다.
 */
export function currentLeavePeriod(hireDate: string, asOf: string): LeavePeriod {
  const years = completedYears(hireDate, asOf);
  if (years < 1) {
    return {
      periodStart: hireDate,
      periodEnd: addDays(addYears(hireDate, 1), -1),
      granted: Math.min(11, completedMonths(hireDate, asOf)),
      isFirstYear: true,
    };
  }
  const periodStart = addYears(hireDate, years);
  return {
    periodStart,
    periodEnd: addDays(addYears(hireDate, years + 1), -1),
    granted: annualLeaveForServiceYears(years),
    isFirstYear: false,
  };
}
