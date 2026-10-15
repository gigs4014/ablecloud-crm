'use client';

import { useState } from 'react';
import type { AttendanceDto } from '@erm/shared';
import { ClockCard } from '@/components/clock-card';
import { Button, Card, Empty, ErrorText } from '@/components/ui';
import { useApi } from '@/lib/api';
import { formatDay, formatHours, formatMinutes, formatTime } from '@/lib/format';

function currentMonth() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()).slice(0, 7);
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

const SOURCE: Record<string, string> = { WEB: '웹', MOBILE: '모바일', CHAT: '채팅', CORRECTION: '정정' };

export default function AttendancePage() {
  const [month, setMonth] = useState(currentMonth());
  const today = useApi<{ record: AttendanceDto | null; allowedNetwork: boolean }>('/attendance/today');
  const list = useApi<AttendanceDto[]>(`/attendance?month=${month}`);
  const total = list.data?.reduce((s, r) => s + r.workedMinutes, 0) ?? 0;
  const [y, m] = month.split('-');

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <header>
        <p className="text-sm text-muted">근태</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[26px]">출퇴근 기록</h1>
      </header>

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[1_1_280px]">
          {today.data ? (
            <ClockCard
              record={today.data.record}
              allowedNetwork={today.data.allowedNetwork}
              onChange={() => {
                void today.reload();
                void list.reload();
              }}
            />
          ) : (
            <ErrorText>{today.error}</ErrorText>
          )}
        </div>

        <Card className="min-w-0 flex-[2_1_480px]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}>
                ‹
              </Button>
              <h2 className="text-[17px] font-bold">
                {y}년 {Number(m)}월
              </h2>
              <Button
                size="sm"
                variant="ghost"
                aria-label="다음 달"
                disabled={month >= currentMonth()}
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                ›
              </Button>
            </div>
            <p className="text-sm text-ink-2">
              합계 <strong className="num">{formatHours(total)}</strong>시간 · {list.data?.length ?? 0}일
            </p>
          </div>
          {list.data?.length === 0 ? (
            <Empty>이 달의 기록이 없어요</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[13px] text-muted">
                    <th scope="col" className="border-b border-line px-2 py-2.5 font-semibold">날짜</th>
                    <th scope="col" className="border-b border-line px-2 py-2.5 font-semibold">출근</th>
                    <th scope="col" className="border-b border-line px-2 py-2.5 font-semibold">퇴근</th>
                    <th scope="col" className="border-b border-line px-2 py-2.5 font-semibold">근무</th>
                    <th scope="col" className="border-b border-line px-2 py-2.5 font-semibold">방식</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data?.map((r) => (
                    <tr key={r.workDate} className="border-b border-line last:border-0">
                      <td className="px-2 py-3 font-semibold">{formatDay(r.workDate)}</td>
                      <td className="num px-2 py-3">{formatTime(r.clockIn)}</td>
                      <td className="num px-2 py-3">{formatTime(r.clockOut)}</td>
                      <td className="num px-2 py-3">{formatMinutes(r.workedMinutes)}</td>
                      <td className="px-2 py-3 text-muted">{SOURCE[r.source] ?? r.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-[13px] text-muted">근무시간은 법정 휴게시간(4시간 이상 30분, 8시간 이상 1시간)을 뺀 값이에요.</p>
        </Card>
      </div>
    </div>
  );
}
