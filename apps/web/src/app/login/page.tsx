'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { Button, ErrorText } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력하세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/auth/login', { body: { email, password } });
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        이메일
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          className="h-11 rounded-[10px] border border-line-strong bg-surface px-3.5 text-[15px] font-normal outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        비밀번호
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          className="h-11 rounded-[10px] border border-line-strong bg-surface px-3.5 text-[15px] font-normal outline-none focus:border-accent"
        />
      </label>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy} className="mt-2">
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
