import type { LeaveStatus } from '@erm/shared';
import { Badge } from './ui';

const MAP: Record<LeaveStatus, { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  PENDING: { label: '결재 대기', tone: 'warn' },
  APPROVED: { label: '승인', tone: 'ok' },
  REJECTED: { label: '반려', tone: 'danger' },
  CANCELED: { label: '취소', tone: 'neutral' },
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const s = MAP[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
