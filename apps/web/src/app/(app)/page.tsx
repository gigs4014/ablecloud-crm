'use client';

import Link from 'next/link';
import type { DashboardDto, TeamMemberStatusDto } from '@erm/shared';
import { ClockCard } from '@/components/clock-card';
import { useMe } from '@/components/app-shell';
import { SearchIcon } from '@/components/icons';
import { SuggestionCard } from '@/components/suggestion-card';
import { Badge, Card, CardHeader, cx, Empty, ErrorText, Skeleton } from '@/components/ui';
import { useApi } from '@/lib/api';
import { formatDayLong, formatDays, formatHours, formatTime, relativeTime } from '@/lib/format';

const KIND: Record<string, { label: string; tone: 'accent' | 'warn' | 'ok' | 'neutral' }> = {
  MAIL: { label: '메일', tone: 'accent' },
  APPROVAL: { label: '결재', tone: 'warn' },
  FILE: { label: '파일', tone: 'neutral' },
  CHAT: { label: '채팅', tone: 'ok' },
};

const TEAM_STATUS: Record<TeamMemberStatusDto['status'], { label: string; className: string }> = {
  WORKING: { label: '근무 중', className: 'text-ok-ink' },
  LEFT: { label: '퇴근', className: 'text-muted' },
  NOT_IN: { label: '출근 전', className: 'text-muted' },
  ON_LEAVE: { label: '휴가', className: 'text-warn-ink' },
};

const WEEKDAYS = ['월', '화', '수', '목', '금'];

export default function HomePage() {
  const me = useMe();
  const { data, error, loading, reload } = useApi<DashboardDto>('/dashboard');

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-16 w-80" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }
  if (!data) return <ErrorText>{error ?? '데이터를 불러오지 못했습니다.'}</ErrorText>;

  const counts = {
    working: data.team.filter((t) => t.status === 'WORKING').length,
    leave: data.team.filter((t) => t.status === 'ON_LEAVE').length,
  };
  const maxDay = Math.max(480, ...data.weekDailyMinutes.map((d) => d.minutes));

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{formatDayLong(data.today)}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[26px]">
            {me ? `${me.name}님, 안녕하세요` : '안녕하세요'}
          </h1>
        </div>
        <label className="flex h-11 w-full max-w-[360px] items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3.5 text-muted">
          <SearchIcon size={18} />
          <span className="sr-only">통합 검색</span>
          <input
            type="search"
            disabled
            placeholder="메일·파일·대화 통합 검색 (준비 중)"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
          />
        </label>
      </header>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        <ClockCard record={data.attendance} allowedNetwork={data.allowedNetwork} onChange={reload} />

        <Card className="flex flex-col gap-2.5">
          <span className="text-sm font-semibold text-muted">잔여 연차</span>
          {data.balance && (
            <>
              <p>
                <span className="num text-4xl">{formatDays(data.balance.remaining)}</span>
                <span className="text-[15px] text-muted"> / {formatDays(data.balance.granted)}일</span>
              </p>
              <div className="h-2 overflow-hidden rounded bg-surface-muted">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${data.balance.granted ? (data.balance.remaining / data.balance.granted) * 100 : 0}%` }}
                />
              </div>
              {data.balance.pending > 0 && <p className="text-[13px] text-muted">신청 중 {formatDays(data.balance.pending)}일</p>}
            </>
          )}
          <Link href="/leave" className="mt-auto text-sm font-semibold text-accent">
            휴가 신청 →
          </Link>
        </Card>

        {me?.role !== 'MEMBER' && (
          <Card className="flex flex-col gap-2.5">
            <span className="text-sm font-semibold text-muted">결재 대기</span>
            <p>
              <span className={cx('num text-4xl', data.pendingApprovals > 0 && 'text-warn')}>{data.pendingApprovals}</span>
              <span className="text-[15px] text-muted"> 건</span>
            </p>
            <Link href="/approvals" className="mt-auto text-sm font-semibold text-accent">
              결재함 열기 →
            </Link>
          </Card>
        )}

        <Card className="flex flex-col gap-2.5">
          <span className="text-sm font-semibold text-muted">이번 주 근무시간</span>
          <p>
            <span className="num text-4xl">{formatHours(data.weekWorkedMinutes)}</span>
            <span className="text-[15px] text-muted"> / 40시간</span>
          </p>
          <div className="mt-auto flex h-10 items-end gap-1.5" aria-hidden="true">
            {data.weekDailyMinutes.map((d) => (
              <div
                key={d.date}
                className={cx('flex-1 rounded-sm', d.date === data.today ? 'bg-accent' : 'bg-accent/30')}
                style={{ height: `${Math.max(6, (d.minutes / maxDay) * 100)}%` }}
              />
            ))}
          </div>
          <div className="flex gap-1.5 text-[11px] text-muted">
            {WEEKDAYS.map((w) => (
              <span key={w} className="flex-1 text-center">
                {w}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        <Card aria-labelledby="today-events">
          <CardHeader title="오늘 일정" id="today-events" action={<Link href="/schedule" className="text-[13px] text-accent">전체 보기</Link>} />
          {data.events.length === 0 ? (
            <Empty>오늘 일정이 없어요</Empty>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {data.events.map((e) => (
                <li key={e.id} className="flex items-start gap-3.5">
                  <span className="num w-11 pt-0.5 text-[13px] text-muted">{e.allDay ? '종일' : formatTime(e.startsAt)}</span>
                  <div className={cx('flex-1 border-l-[3px] pl-3', e.allDay ? 'border-line-strong' : 'border-accent')}>
                    <p className="text-[15px] font-semibold">{e.title}</p>
                    <p className="text-[13px] text-muted">
                      {e.source === 'LEAVE' ? '휴가 승인 시 자동 등록' : e.source === 'SUGGESTION' ? '대화에서 등록됨' : '회사 일정'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="suggestions">
          <CardHeader
            title="대화에서 찾은 일정"
            id="suggestions"
            action={data.suggestions.length > 0 && <Badge tone="warn">확인 필요 {data.suggestions.length}</Badge>}
          />
          {data.suggestions.length === 0 ? (
            <Empty>확인할 일정이 없어요</Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {data.suggestions.map((s) => (
                <SuggestionCard key={s.id} item={s} onDone={reload} />
              ))}
            </div>
          )}
        </Card>

        <Card aria-labelledby="feed">
          <CardHeader title="새 소식" id="feed" />
          {data.notifications.length === 0 ? (
            <Empty>새 소식이 없어요</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {data.notifications.map((n) => {
                const kind = KIND[n.kind] ?? { label: '알림', tone: 'neutral' as const };
                return (
                  <li key={n.id} className="flex gap-3 py-2.5">
                    <Badge tone={kind.tone}>{kind.label}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className={cx('text-sm', n.readAt ? 'text-ink-2' : 'font-semibold')}>{n.title}</p>
                      {n.body && <p className="truncate text-[13px] text-muted">{n.body}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-muted">{relativeTime(n.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card aria-labelledby="team">
        <CardHeader
          title="오늘 팀 현황"
          id="team"
          action={
            <span className="flex gap-4 text-[13px] text-ink-2">
              <span>근무 {counts.working}</span>
              <span>휴가 {counts.leave}</span>
            </span>
          }
        />
        <ul className="flex flex-wrap gap-2.5">
          {data.team.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5 rounded-xl border border-line py-2 pl-2 pr-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-surface-muted text-[13px] font-semibold text-ink-2">
                {m.name.slice(0, 1)}
              </span>
              <span>
                <span className="block text-sm font-semibold">{m.name}</span>
                <span className={cx('block text-xs', TEAM_STATUS[m.status].className)}>
                  {TEAM_STATUS[m.status].label}
                  {m.detail && ` · ${m.detail}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
