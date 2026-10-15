/**
 * 출퇴근 시각으로 근무 시간(분)을 계산합니다.
 * 근로기준법 제54조 기준 휴게시간을 뺍니다: 4시간 이상 30분, 8시간 이상 1시간.
 * (회사 정책이 다르면 이 함수만 바꾸면 됩니다)
 */
export function breakMinutesFor(spanMinutes: number): number {
  if (spanMinutes >= 9 * 60) return 60;
  if (spanMinutes >= 8 * 60 + 30) return spanMinutes - 8 * 60;
  if (spanMinutes >= 4 * 60 + 30) return 30;
  if (spanMinutes > 4 * 60) return spanMinutes - 4 * 60;
  return 0;
}

export function workedMinutes(clockIn: Date | null, clockOut: Date | null, now: Date = new Date()): number {
  if (!clockIn) return 0;
  const end = clockOut ?? now;
  const span = Math.max(0, Math.floor((end.getTime() - clockIn.getTime()) / 60000));
  return span - breakMinutesFor(span);
}
