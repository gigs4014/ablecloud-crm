'use client';

import { useState } from 'react';
import type { ScheduleSuggestionDto } from '@erm/shared';
import { api } from '@/lib/api';
import { formatDay, formatTime } from '@/lib/format';
import { CheckIcon } from './icons';
import { Button, ErrorText } from './ui';

function localDate(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso));
}

/** 대화에서 찾은 일정 후보. 사용자가 등록/무시를 골라야 캘린더에 들어갑니다. */
export function SuggestionCard({ item, onDone }: { item: ScheduleSuggestionDto; onDone?: () => void }) {
  const [state, setState] = useState<'PENDING' | 'ACCEPTED' | 'DISMISSED'>(item.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'ACCEPT' | 'DISMISS') {
    setBusy(true);
    setError(null);
    try {
      await api(`/schedule/suggestions/${item.id}/decision`, { body: { decision } });
      setState(decision === 'ACCEPT' ? 'ACCEPTED' : 'DISMISSED');
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (state === 'DISMISSED') return null;

  return (
    <article className="flex flex-col gap-2.5 rounded-xl border border-line p-4">
      <p className="text-[13px] text-muted">{item.sourceLabel}</p>
      <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm leading-relaxed text-ink-2">{item.quote}</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold">{item.title}</p>
          <p className="text-[13px] text-muted">
            {formatDay(localDate(item.startsAt))} {formatTime(item.startsAt)} – {formatTime(item.endsAt)}
            {item.participants.length > 0 && ` · ${item.participants.join(', ')}`}
          </p>
        </div>
        {state === 'ACCEPTED' ? (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ok-ink">
            <CheckIcon size={16} /> 등록 완료
          </span>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide('DISMISS')}>
              무시
            </Button>
            <Button size="sm" disabled={busy} onClick={() => decide('ACCEPT')}>
              일정 등록
            </Button>
          </div>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </article>
  );
}
