'use client';

import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** /api 프록시를 통해 API를 호출합니다. 401이면 로그인 화면으로 이동합니다. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError('로그인이 필요합니다.', 401);
  }
  if (!res.ok) {
    let message = '요청을 처리하지 못했습니다.';
    try {
      const data = await res.json();
      message = Array.isArray(data.message) ? data.message[0] : (data.message ?? message);
    } catch {
      /* 본문 없음 */
    }
    throw new ApiError(message, res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** 간단한 조회 훅. reload()로 다시 불러옵니다. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}
