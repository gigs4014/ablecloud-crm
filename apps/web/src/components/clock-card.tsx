'use client';

import { useEffect, useState } from 'react';
import type { AttendanceDto } from '@erm/shared';
import { api } from '@/lib/api';
import { formatMinutes, formatTime } from '@/lib/format';
import { Button, cx, ErrorText } from './ui';

/** 출퇴근 카드. 홈과 근태 화면에서 함께 씁니다. */
export function ClockCard({
  record,
  allowedNetwork,
  onChange,
}: {
  record: AttendanceDto | null;
  allowedNetwork: boolean;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  useEffect(() => {
    setLoadedAt(Date.now());
    setNow(Date.now());
  }, [record]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const working = Boolean(record?.clockIn && !record.clockOut);
  const done = Boolean(record?.clockOut);
  // 근무 중이면 서버 계산값에 화면을 연 뒤 지난 시간을 더해 보여줍니다.
  const minutes = record
    ? working
      ? record.workedMinutes + Math.max(0, Math.floor((now - loadedAt) / 60000))
      : record.workedMinutes
    : 0;

  async function act(path: 'clock-in' | 'clock-out') {
    setBusy(true);
    setError(null);
    try {
      await api(`/attendance/${path}`, { method: 'POST' });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="출퇴근"
      className={cx('flex flex-col gap-3.5 rounded-2xl p-6', working ? 'bg-accent text-white' : 'border border-line bg-surface')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{working ? '근무 중' : done ? '퇴근 완료' : '출근 전'}</span>
        <span className={cx('rounded-full px-2.5 py-0.5 text-[13px]', working ? 'bg-white/20' : allowedNetwork ? 'bg-ok-soft text-ok-ink' : 'bg-warn-soft text-warn-ink')}>
          {allowedNetwork ? '사내 네트워크' : '외부 네트워크'}
        </span>
      </div>
      <div className="num text-4xl">{record ? formatMinutes(minutes) : '0:00'}</div>
      <div className={cx('text-[13px]', working ? 'text-white/90' : 'text-muted')}>
        출근 {formatTime(record?.clockIn)} · 퇴근 {formatTime(record?.clockOut)}
      </div>
      {!done && (
        <Button
          variant={working ? 'inverse' : 'primary'}
          disabled={busy || !allowedNetwork}
          onClick={() => act(working ? 'clock-out' : 'clock-in')}
        >
          {busy ? '처리 중…' : working ? '퇴근하기' : '출근하기'}
        </Button>
      )}
      {!allowedNetwork && !done && <p className="text-[13px] text-warn-ink">사내 네트워크에 연결하면 출퇴근할 수 있어요.</p>}
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
