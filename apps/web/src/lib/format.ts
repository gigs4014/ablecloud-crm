const TZ = 'Asia/Seoul';

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso),
  );
}

/** '2026-10-15' → '10월 15일 (목)' */
export function formatDay(isoDate: string, withYear = false): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'UTC',
    year: withYear ? 'numeric' : undefined,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(d);
}

export function formatDayLong(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(d);
}

export function formatRange(start: string, end: string): string {
  return start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`;
}

/** 분 → 'H:MM' */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

export function formatDays(days: number): string {
  return Number.isInteger(days) ? String(days) : days.toFixed(2).replace(/0$/, '');
}

export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return '방금';
  if (diff < 60) return `${Math.floor(diff)}분 전`;
  if (diff < 60 * 24) return formatTime(iso);
  return new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, month: 'numeric', day: 'numeric' }).format(new Date(iso));
}
