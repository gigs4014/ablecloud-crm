'use client';

import { useMemo, useState, type FormEvent } from 'react';
import {
  calculateLeaveDays,
  DEDUCTIBLE_LEAVE_TYPES,
  isPartialDay,
  LEAVE_TYPE_LABEL,
  LEAVE_TYPES,
  type LeaveBalanceDto,
  type LeaveRequestDto,
  type LeaveType,
} from '@erm/shared';
import { LeaveStatusBadge } from '@/components/leave-status';
import { Button, Card, CardHeader, cx, Empty, ErrorText } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { formatDay, formatDays, formatRange } from '@/lib/format';

const inputClass =
  'h-11 rounded-[10px] border border-line-strong bg-surface px-3.5 text-[15px] font-normal text-ink outline-none focus:border-accent';

function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export default function LeavePage() {
  const balance = useApi<LeaveBalanceDto>('/leave/balance');
  const history = useApi<LeaveRequestDto[]>('/leave/requests');

  const [type, setType] = useState<LeaveType>('ANNUAL');
  const [start, setStart] = useState(todayLocal());
  const [end, setEnd] = useState(todayLocal());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveEnd = isPartialDay(type) ? start : end;
  const preview = useMemo(() => {
    try {
      if (!start || !effectiveEnd || start > effectiveEnd) return null;
      return calculateLeaveDays(type, start, effectiveEnd);
    } catch {
      return null;
    }
  }, [type, start, effectiveEnd]);

  const deducts = DEDUCTIBLE_LEAVE_TYPES.has(type);
  const after = balance.data && preview !== null && deducts ? balance.data.remaining - balance.data.pending - preview : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (!start || !effectiveEnd) return setError('기간을 선택하세요.');
    if (start > effectiveEnd) return setError('종료일이 시작일보다 빠릅니다.');
    if (preview === 0) return setError('선택한 기간에 근무일이 없습니다.');
    setBusy(true);
    setError(null);
    try {
      const created = await api<LeaveRequestDto>('/leave/requests', {
        body: { type, startDate: start, endDate: effectiveEnd, reason: reason || undefined },
      });
      setNotice(created.status === 'APPROVED' ? '휴가가 승인되어 캘린더에 등록되었어요.' : `${created.approver?.name ?? '결재자'}님에게 결재를 요청했어요.`);
      setReason('');
      await Promise.all([balance.reload(), history.reload()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    try {
      await api(`/leave/requests/${id}/cancel`, { method: 'POST' });
      await Promise.all([balance.reload(), history.reload()]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const today = todayLocal();

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <header>
        <p className="text-sm text-muted">휴가</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[26px]">휴가 신청</h1>
      </header>

      <div className="flex flex-wrap items-start gap-4">
        <form onSubmit={submit} noValidate className="flex min-w-0 flex-[2_1_480px] flex-col gap-6 rounded-2xl border border-line bg-surface p-6 sm:p-7">
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2.5 text-sm font-semibold">휴가 종류</legend>
            <div className="flex flex-wrap gap-2">
              {LEAVE_TYPES.map((t) => (
                <label
                  key={t}
                  className={cx(
                    'flex h-11 cursor-pointer items-center rounded-[10px] px-4 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
                    type === t ? 'border-2 border-accent bg-accent-soft font-semibold text-accent-ink' : 'border border-line-strong text-ink-2',
                  )}
                >
                  <input
                    type="radio"
                    name="type"
                    value={t}
                    checked={type === t}
                    onChange={() => {
                      setType(t);
                      setError(null);
                    }}
                    className="sr-only"
                  />
                  {LEAVE_TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold">
              {isPartialDay(type) ? '날짜' : '시작일'}
              <input
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (e.target.value > end) setEnd(e.target.value);
                  setError(null);
                }}
                className={inputClass}
              />
            </label>
            {!isPartialDay(type) && (
              <label className="flex flex-col gap-2 text-sm font-semibold">
                종료일
                <input
                  type="date"
                  value={end}
                  min={start}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    setError(null);
                  }}
                  className={inputClass}
                />
              </label>
            )}
          </div>

          <label className="flex flex-col gap-2 text-sm font-semibold">
            <span>
              사유 <span className="text-[13px] font-normal text-muted">선택 사항</span>
            </span>
            <textarea
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-y rounded-[10px] border border-line-strong bg-surface px-3.5 py-3 text-[15px] font-normal text-ink outline-none focus:border-accent"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p className="text-sm text-ink-2">
              {preview === null ? (
                '기간을 확인하세요'
              ) : (
                <>
                  주말 제외 <strong>{formatDays(preview)}일</strong>
                  {after !== null && (
                    <>
                      {' '}
                      · 승인 후 잔여 <strong className={cx(after < 0 && 'text-danger-ink')}>{formatDays(after)}일</strong>
                    </>
                  )}
                  {!deducts && ' · 연차에서 차감되지 않아요'}
                </>
              )}
            </p>
            <Button type="submit" disabled={busy}>
              {busy ? '신청 중…' : '신청하기'}
            </Button>
          </div>
          <ErrorText>{error}</ErrorText>
          {notice && (
            <p role="status" className="text-sm font-medium text-ok-ink">
              {notice}
            </p>
          )}
        </form>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Card aria-labelledby="balance">
            <CardHeader title="연차 현황" id="balance" />
            {balance.data ? (
              <div className="flex flex-col gap-3">
                <p>
                  <span className="num text-[34px]">{formatDays(balance.data.remaining)}</span>
                  <span className="text-sm text-muted"> 일 남음</span>
                </p>
                <div className="grid grid-cols-3 gap-2 text-[13px]">
                  {[
                    ['발생', balance.data.granted],
                    ['사용', balance.data.used],
                    ['신청 중', balance.data.pending],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-surface-muted p-2.5">
                      <p className="text-muted">{label}</p>
                      <p className="text-[15px] font-bold">{formatDays(value as number)}일</p>
                    </div>
                  ))}
                </div>
                <p className="text-[13px] text-muted">
                  입사일 기준 · {formatDay(balance.data.periodStart, true)} ~ {formatDay(balance.data.periodEnd, true)}
                </p>
              </div>
            ) : (
              <ErrorText>{balance.error}</ErrorText>
            )}
          </Card>

          <Card aria-labelledby="history">
            <CardHeader title="신청 내역" id="history" />
            {history.data?.length === 0 && <Empty>신청한 휴가가 없어요</Empty>}
            <ul className="divide-y divide-line">
              {history.data?.map((r) => {
                const cancellable = r.status === 'PENDING' || (r.status === 'APPROVED' && r.startDate > today);
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {LEAVE_TYPE_LABEL[r.type]} {formatDays(r.days)}일
                      </p>
                      <p className="text-[13px] text-muted">{formatRange(r.startDate, r.endDate)}</p>
                      {r.decisionComment && <p className="text-[13px] text-muted">“{r.decisionComment}”</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <LeaveStatusBadge status={r.status} />
                      {cancellable && (
                        <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>
                          취소
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
