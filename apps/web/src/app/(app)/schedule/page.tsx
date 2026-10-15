'use client';

import type { CalendarEventDto, ScheduleSuggestionDto } from '@erm/shared';
import { SuggestionCard } from '@/components/suggestion-card';
import { Card, CardHeader, cx, Empty, ErrorText } from '@/components/ui';
import { useApi } from '@/lib/api';
import { formatDay, formatTime } from '@/lib/format';

function addDaysLocal(days: number) {
  const base = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function localDate(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso));
}

export default function SchedulePage() {
  const from = addDaysLocal(0);
  const to = addDaysLocal(13);
  const suggestions = useApi<ScheduleSuggestionDto[]>('/schedule/suggestions');
  const events = useApi<CalendarEventDto[]>(`/schedule/events?from=${from}&to=${to}`);

  // 날짜별로 묶기 (종일 일정은 시작일 기준)
  const groups = new Map<string, CalendarEventDto[]>();
  for (const e of events.data ?? []) {
    const day = localDate(e.startsAt) < from ? from : localDate(e.startsAt);
    groups.set(day, [...(groups.get(day) ?? []), e]);
  }
  const days = [...groups.keys()].sort();

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <header>
        <p className="text-sm text-muted">일정</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[26px]">일정</h1>
      </header>

      <div className="flex flex-wrap items-start gap-4">
        <Card className="min-w-0 flex-[1_1_360px]" aria-labelledby="sugg">
          <CardHeader title="대화에서 찾은 일정" id="sugg" />
          <p className="mb-4 text-[13px] leading-relaxed text-muted">
            채팅에서 일정으로 보이는 대화를 찾아 보여드려요. 확인하기 전에는 캘린더에 들어가지 않아요.
          </p>
          {suggestions.error && <ErrorText>{suggestions.error}</ErrorText>}
          {suggestions.data?.length === 0 ? (
            <Empty>확인할 일정이 없어요</Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {suggestions.data?.map((s) => <SuggestionCard key={s.id} item={s} onDone={() => void events.reload()} />)}
            </div>
          )}
        </Card>

        <Card className="min-w-0 flex-[2_1_420px]" aria-labelledby="upcoming">
          <CardHeader title="앞으로 2주" id="upcoming" />
          {events.error && <ErrorText>{events.error}</ErrorText>}
          {days.length === 0 ? (
            <Empty>예정된 일정이 없어요</Empty>
          ) : (
            <div className="flex flex-col gap-5">
              {days.map((day) => (
                <section key={day}>
                  <h3 className="mb-2 text-[13px] font-semibold text-muted">{day === from ? `오늘 · ${formatDay(day)}` : formatDay(day)}</h3>
                  <ul className="flex flex-col gap-3">
                    {groups.get(day)!.map((e) => (
                      <li key={e.id} className="flex items-start gap-3.5">
                        <span className="num w-11 pt-0.5 text-[13px] text-muted">{e.allDay ? '종일' : formatTime(e.startsAt)}</span>
                        <div className={cx('flex-1 border-l-[3px] pl-3', e.allDay ? 'border-line-strong' : 'border-accent')}>
                          <p className="text-[15px] font-semibold">{e.title}</p>
                          {!e.allDay && (
                            <p className="text-[13px] text-muted">
                              {formatTime(e.startsAt)} – {formatTime(e.endsAt)}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
