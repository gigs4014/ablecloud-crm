'use client';

import { useEffect, useState } from 'react';
import { ipInCidr, type AdminSettingsDto, type IntegrationTestResultDto } from '@erm/shared';
import { useMe } from '@/components/app-shell';
import { PasswordInput } from '@/components/password-input';
import { Badge, Button, Card, CardHeader, cx, Empty, ErrorText, Skeleton } from '@/components/ui';
import { api, useApi } from '@/lib/api';

const inputClass =
  'h-11 w-full rounded-[10px] border border-line-strong bg-surface px-3.5 text-[15px] font-normal text-ink outline-none focus:border-accent';

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-semibold">
      {label}
      {children}
      {hint && <span className="text-[13px] font-normal leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

function TestResult({ result }: { result: IntegrationTestResultDto | null }) {
  if (!result) return null;
  return (
    <p role="status" className={cx('text-sm font-medium', result.ok ? 'text-ok-ink' : 'text-danger-ink')}>
      {result.message}
    </p>
  );
}

function IntegrationSection({ data, onSaved }: { data: AdminSettingsDto; onSaved: (d: AdminSettingsDto) => void }) {
  const s = data.integration.synology;
  const [provider, setProvider] = useState(data.integration.provider);
  const [chatWebhookUrl, setChatWebhookUrl] = useState(s.chatWebhookUrl);
  const [caldavUrl, setCaldavUrl] = useState(s.caldavUrl);
  const [caldavUsername, setCaldavUsername] = useState(s.caldavUsername);
  const [caldavPassword, setCaldavPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<'chat' | 'calendar' | null>(null);
  const [results, setResults] = useState<Record<'chat' | 'calendar', IntegrationTestResultDto | null>>({ chat: null, calendar: null });

  const dirty =
    provider !== data.integration.provider ||
    chatWebhookUrl !== s.chatWebhookUrl ||
    caldavUrl !== s.caldavUrl ||
    caldavUsername !== s.caldavUsername ||
    caldavPassword !== '';

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next = await api<AdminSettingsDto>('/admin/settings', {
        method: 'PUT',
        body: {
          integration: {
            provider,
            synology: {
              chatWebhookUrl,
              caldavUrl,
              caldavUsername,
              caldavPassword: caldavPassword === '' ? undefined : caldavPassword,
            },
          },
        },
      });
      setCaldavPassword('');
      setSaved(true);
      setResults({ chat: null, calendar: null });
      onSaved(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function test(target: 'chat' | 'calendar') {
    setTesting(target);
    try {
      const r = await api<IntegrationTestResultDto>('/admin/settings/integration/test', { body: { target } });
      setResults((prev) => ({ ...prev, [target]: r }));
    } catch (e) {
      setResults((prev) => ({ ...prev, [target]: { ok: false, message: (e as Error).message } }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <Card aria-labelledby="integration">
      <CardHeader
        title="시놀로지 연동"
        id="integration"
        action={<Badge tone={data.integration.provider === 'synology' ? 'ok' : 'neutral'}>{data.integration.provider === 'synology' ? '사용 중' : '사용 안 함'}</Badge>}
      />
      <p className="mb-5 text-[13px] leading-relaxed text-muted">
        연결하면 휴가 결재 알림이 시놀로지 챗 채널로 가고, 승인된 휴가와 등록한 일정이 시놀로지 캘린더에도 들어가요. 연결이 끊겨도 포털 기능은 그대로
        동작해요.
      </p>
      {data.integration.fromEnvironment && (
        <p className="mb-5 rounded-lg bg-surface-muted px-3.5 py-2.5 text-[13px] text-ink-2">
          지금은 서버 설정 파일(.env)의 값을 쓰고 있어요. 여기서 저장하면 이 화면의 값이 우선 적용돼요.
        </p>
      )}

      <fieldset className="mb-6">
        <legend className="mb-2.5 text-sm font-semibold">연동 사용</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['internal', '사용 안 함 (포털 자체 기능만)'],
              ['synology', '시놀로지 연동'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cx(
                'flex h-11 cursor-pointer items-center rounded-[10px] px-4 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
                provider === value ? 'border-2 border-accent bg-accent-soft font-semibold text-accent-ink' : 'border border-line-strong text-ink-2',
              )}
            >
              <input type="radio" name="provider" value={value} checked={provider === value} onChange={() => setProvider(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-xl border border-line p-4 sm:p-5">
          <h3 className="text-[15px] font-bold">챗 알림</h3>
          <Field
            label="수신 웹훅 주소"
            hint={
              <>
                시놀로지 챗 → 오른쪽 위 프로필 → <b>통합</b> → <b>수신 웹훅</b> → 만들기에서 알림 받을 채널을 고르고 웹훅 URL을 복사해 붙여 넣으세요.
              </>
            }
          >
            <input
              type="url"
              value={chatWebhookUrl}
              onChange={(e) => setChatWebhookUrl(e.target.value)}
              placeholder="https://nas.company.com/webapi/entry.cgi?api=SYNO.Chat.External&method=incoming&version=2&token=..."
              className={inputClass}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" disabled={testing !== null || dirty} onClick={() => test('chat')}>
              {testing === 'chat' ? '보내는 중…' : '테스트 메시지 보내기'}
            </Button>
            <TestResult result={results.chat} />
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-line p-4 sm:p-5">
          <h3 className="text-[15px] font-bold">회사 캘린더 (CalDAV)</h3>
          <Field
            label="CalDAV 주소"
            hint={
              <>
                Synology Calendar → 회사 캘린더 옆 메뉴(⋮) → <b>CalDAV 계정</b>에서 해당 캘린더의 주소를 복사하세요. 캘린더 하나의 주소여야 해요.
              </>
            }
          >
            <input
              type="url"
              value={caldavUrl}
              onChange={(e) => setCaldavUrl(e.target.value)}
              placeholder="https://nas.company.com:5001/caldav/계정/캘린더ID/"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="계정" hint="회사 캘린더에 쓰기 권한이 있는 DSM 계정 (연동 전용 계정을 권장해요)">
              <input
                type="text"
                autoComplete="off"
                value={caldavUsername}
                onChange={(e) => setCaldavUsername(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="비밀번호" hint={s.caldavPasswordSet ? '저장되어 있어요. 바꿀 때만 입력하세요.' : '암호화해서 저장해요.'}>
              <PasswordInput
                autoComplete="new-password"
                value={caldavPassword}
                onChange={(e) => setCaldavPassword(e.target.value)}
                placeholder={s.caldavPasswordSet ? '••••••••' : ''}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" disabled={testing !== null || dirty} onClick={() => test('calendar')}>
              {testing === 'calendar' ? '확인 중…' : '캘린더 연결 확인'}
            </Button>
            <TestResult result={results.calendar} />
          </div>
        </section>
      </div>

      {!data.encryptionReady && (
        <p className="mt-5 text-[13px] text-warn-ink">
          서버에 DATA_ENCRYPTION_KEY가 설정되지 않아 비밀번호를 저장할 수 없어요. 서버 관리자에게 .env 설정을 요청하세요.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="text-[13px] text-muted">{dirty ? '저장한 뒤 연결 테스트를 할 수 있어요.' : saved ? '저장했어요.' : ''}</p>
        <Button disabled={busy || !dirty} onClick={save}>
          {busy ? '저장 중…' : '저장'}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function NetworkSection({ data, onSaved }: { data: AdminSettingsDto; onSaved: (d: AdminSettingsDto) => void }) {
  const [text, setText] = useState(data.allowedCidrs.join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setText(data.allowedCidrs.join('\n')), [data.allowedCidrs]);

  const list = text
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
  const dirty = list.join('\n') !== data.allowedCidrs.join('\n');

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      onSaved(await api<AdminSettingsDto>('/admin/settings', { method: 'PUT', body: { allowedCidrs: list } }));
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="network">
      <CardHeader title="출근 허용 네트워크" id="network" />
      <p className="mb-4 text-[13px] leading-relaxed text-muted">
        여기에 적은 사내 IP 대역에서만 출퇴근 버튼을 누를 수 있어요. 비워 두면 어디서든 가능해요. 로그인은 막지 않아요.
      </p>
      <Field label="IP 대역 (한 줄에 하나)" hint="예: 192.168.10.0/24 (사무실 공유기 대역), 203.0.113.7 (회사 고정 IP 하나)">
        <textarea
          rows={4}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
            setError(null);
          }}
          className="num rounded-[10px] border border-line-strong bg-surface px-3.5 py-3 text-[15px] font-normal text-ink outline-none focus:border-accent"
        />
      </Field>
      {data.currentIp && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          지금 접속한 IP: <span className="num">{data.currentIp}</span>
          {!list.some((c) => c === data.currentIp || c === `${data.currentIp}/32` || ipInCidr(data.currentIp!, c)) && (
            <Button size="sm" variant="ghost" onClick={() => setText((t) => `${t.trim() ? `${t.trim()}\n` : ''}${data.currentIp}`)}>
              이 IP 추가
            </Button>
          )}
        </div>
      )}
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-5">
        <p className="text-[13px] text-muted">{saved ? '저장했어요.' : ''}</p>
        <Button disabled={busy || !dirty} onClick={save}>
          {busy ? '저장 중…' : '저장'}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

export default function AdminSettingsPage() {
  const me = useMe();
  const { data, error, loading, setData } = useApi<AdminSettingsDto>(me?.role === 'ADMIN' ? '/admin/settings' : null);

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-6">
      <header>
        <p className="text-sm text-muted">관리자</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[26px]">설정</h1>
      </header>
      {me && me.role !== 'ADMIN' ? (
        <Card>
          <Empty>관리자만 볼 수 있어요</Empty>
        </Card>
      ) : loading && !data ? (
        <Skeleton className="h-96" />
      ) : !data ? (
        <ErrorText>{error}</ErrorText>
      ) : (
        <>
          <IntegrationSection data={data} onSaved={setData} />
          <NetworkSection data={data} onSaved={setData} />
        </>
      )}
    </div>
  );
}
