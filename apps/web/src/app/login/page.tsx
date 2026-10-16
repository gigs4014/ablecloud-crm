'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api } from '@/lib/api';
import { PasswordInput } from '@/components/password-input';
import { Button, ErrorText } from '@/components/ui';

const inputClass =
  'h-11 rounded-[10px] border border-line-strong bg-surface px-3.5 text-[15px] font-normal text-ink outline-none focus:border-accent';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 화면 스크립트가 준비되기 전에 누른 엔터가 페이지를 새로 고치지 않도록 준비 후에만 제출 버튼을 켭니다.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력하세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/auth/login', { body: { email: email.trim(), password } });
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  /**
   * 엔터키로 로그인. 한글 입력 조합 중에 누른 엔터는 글자 확정에 쓰이므로 건너뜁니다.
   * (form의 기본 제출과 함께 써도 busy 확인으로 한 번만 요청됩니다)
   */
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        이메일
        <input
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="off"
          autoFocus
          value={email}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        비밀번호
        <PasswordInput
          autoComplete="current-password"
          value={password}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          className={inputClass}
        />
      </label>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy || !ready} className="mt-2">
        {busy ? '로그인 중…' : '로그인'}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[380px] rounded-2xl border border-line bg-surface p-8">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-accent font-bold text-white">E</div>
          <div>
            <h1 className="text-lg font-bold">[제품명]</h1>
            <p className="text-[13px] text-muted">사내 통합 포털</p>
          </div>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
