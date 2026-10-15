/**
 * 날짜는 시간대 문제를 피하기 위해 'YYYY-MM-DD' 문자열(로컬 달력 날짜)로 다룹니다.
 * 내부 계산은 UTC 자정 기준 Date로만 합니다.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = parseIsoDate(value);
  return formatIsoDate(d) === value;
}

export function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const d = parseIsoDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return formatIsoDate(d);
}

/** 월말 보정 포함 (예: 1/31 + 1개월 = 2/28) */
export function addMonths(value: string, months: number): string {
  const d = parseIsoDate(value);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return formatIsoDate(d);
}

export function addYears(value: string, years: number): string {
  return addMonths(value, years * 12);
}

/** 0=일요일 ... 6=토요일 */
export function dayOfWeek(value: string): number {
  return parseIsoDate(value).getUTCDay();
}

export function isWeekend(value: string): boolean {
  const dow = dayOfWeek(value);
  return dow === 0 || dow === 6;
}

export function compareIsoDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 특정 시간대 기준의 오늘 날짜 */
export function localDateString(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** 해당 시점에서 시간대의 UTC 오프셋(분). 예: Asia/Seoul → 540 */
export function timeZoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** 시간대의 로컬 날짜+시각('HH:mm')을 실제 시점(Date)으로 변환 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const guess = new Date(`${date}T${time}:00.000Z`);
  const offset = timeZoneOffsetMinutes(guess, timeZone);
  const result = new Date(guess.getTime() - offset * 60000);
  const corrected = timeZoneOffsetMinutes(result, timeZone);
  return corrected === offset ? result : new Date(guess.getTime() - corrected * 60000);
}

/** 특정 시간대 기준의 'HH:mm' */
export function localTimeString(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}
