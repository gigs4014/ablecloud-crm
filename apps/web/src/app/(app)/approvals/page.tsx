'use client';

import { useState } from 'react';
import { LEAVE_TYPE_LABEL, type LeaveRequestDto } from '@erm/shared';
import { useMe } from '@/components/app-shell';
import { Button, Card, Empty, ErrorText, Skeleton } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { formatDays, formatRange } from '@/lib/format';

function ApprovalRow({ r, onDone }: { r: LeaveRequestDto; onDone: () => void }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'APPROVE' | 'REJECT') {
    if (decision === 'REJECT' && !comment.trim()) {
      setError('반려 사유를 입력하세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/leave/requests/${r.id}/decision`, { body: { decision, comment: comment.trim() || undefined } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold">
            {r.requester.name} · {LEAVE_TYPE_LABEL[r.type]} {formatDays(r.days)}일
          </p>
          <p className="text-[13px] text-muted">{formatRange(r.startDate, r.endDate)}</p>
          {r.reason && <p className="mt-1 text-sm text-ink-2">사유: {r.reason}</p>}
        </div>
        <p className={r.overlappingTeamCount ? 'text-[13px] font-medium text-warn-ink' : 'text-[13px] text-muted'}>
          같은 기간 팀 부재 {r.overlappingTeamCount ?? 0}명
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1 basis-60">
          <span className="sr-only">의견</span>
          <input
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setError(null);
            }}
            placeholder="의견 (반려 시 필수)"
            className="h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none focus:border-accent"
          />
        </label>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide('REJECT')}>
          반려
        </Button>
        <Button size="sm" disabled={busy} onClick={() => decide('APPROVE')}>
          승인
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

export default function ApprovalsPage() {
  const me = useMe();
  const { data, error, loading, reload } = useApi<LeaveRequestDto[]>(me && me.role !== 'MEMBER' ? '/leave/approvals' : null);

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6">
      <header>
        <p className="text-sm text-muted">결재함</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[26px]">내가 결재할 휴가</h1>
      </header>
      <Card>
        {me?.role === 'MEMBER' ? (
          <Empty>팀장과 관리자만 볼 수 있어요</Empty>
        ) : loading && !data ? (
          <Skeleton className="h-24" />
        ) : error ? (
          <ErrorText>{error}</ErrorText>
        ) : data?.length === 0 ? (
          <Empty>결재할 휴가가 없어요</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {data?.map((r) => <ApprovalRow key={r.id} r={r} onDone={reload} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}
