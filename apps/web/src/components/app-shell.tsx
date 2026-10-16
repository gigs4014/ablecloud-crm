'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LeaveRequestDto, MeDto } from '@erm/shared';
import { api } from '@/lib/api';
import { CalendarIcon, ClockIcon, HomeIcon, InboxIcon, LogoutIcon, PlaneIcon, SettingsIcon } from './icons';
import { cx } from './ui';

const MeContext = createContext<MeDto | null>(null);

export function useMe(): MeDto | null {
  return useContext(MeContext);
}

const NAV = [
  { href: '/', label: '홈', icon: HomeIcon },
  { href: '/attendance', label: '근태', icon: ClockIcon },
  { href: '/leave', label: '휴가', icon: PlaneIcon },
  { href: '/approvals', label: '결재함', icon: InboxIcon, managerOnly: true },
  { href: '/schedule', label: '일정', icon: CalendarIcon },
] as const;

const ADMIN_NAV = { href: '/admin/settings', label: '설정', icon: SettingsIcon } as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeDto | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    api<MeDto>('/auth/me')
      .then((m) => {
        setMe(m);
        if (m.role !== 'MEMBER') {
          api<LeaveRequestDto[]>('/leave/approvals')
            .then((rows) => setPending(rows.length))
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, [pathname]);

  const isManager = me && me.role !== 'MEMBER';
  const items = NAV.filter((n) => !('managerOnly' in n) || isManager);
  // 모바일 하단 메뉴에는 관리자 설정도 함께 보여줍니다.
  const mobileItems = me?.role === 'ADMIN' ? [...items, ADMIN_NAV] : items;
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <MeContext.Provider value={me}>
      <div className="flex min-h-screen">
        <nav
          aria-label="주 메뉴"
          className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col gap-1 border-r border-line bg-surface px-4 py-6 lg:flex"
        >
          <div className="flex items-center gap-2.5 px-2 pb-6">
            <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-[15px] font-bold text-white">E</div>
            <span className="text-[17px] font-bold tracking-tight">[제품명]</span>
          </div>
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? 'page' : undefined}
              className={cx(
                'flex min-h-11 items-center justify-between gap-2.5 rounded-lg px-3 text-[15px]',
                isActive(n.href) ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink-2 hover:bg-surface-muted',
              )}
            >
              <span className="flex items-center gap-2.5">
                <n.icon size={18} />
                {n.label}
              </span>
              {n.href === '/approvals' && pending > 0 && (
                <span className="rounded-full bg-warn px-2 text-xs font-semibold text-white">{pending}</span>
              )}
            </Link>
          ))}
          <div className="mx-2 my-3 h-px bg-line" />
          {me?.role === 'ADMIN' && (
            <Link
              href={ADMIN_NAV.href}
              aria-current={isActive(ADMIN_NAV.href) ? 'page' : undefined}
              className={cx(
                'flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-[15px]',
                isActive(ADMIN_NAV.href) ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink-2 hover:bg-surface-muted',
              )}
            >
              <ADMIN_NAV.icon size={18} />
              {ADMIN_NAV.label}
            </Link>
          )}
          <div className="flex-1" />
          {me && (
            <div className="flex items-center justify-between gap-2 border-t border-line px-2 pt-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{me.name}</p>
                <p className="truncate text-xs text-muted">{me.departmentName ?? me.tenantName}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                aria-label="로그아웃"
                className="flex size-11 items-center justify-center rounded-lg text-muted hover:bg-surface-muted"
              >
                <LogoutIcon size={18} />
              </button>
            </div>
          )}
        </nav>

        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-8 lg:px-10 lg:pb-12 lg:pt-7">{children}</main>

        <nav
          aria-label="하단 메뉴"
          className="fixed inset-x-0 bottom-0 z-10 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
          style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}
        >
          {mobileItems.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? 'page' : undefined}
              className={cx(
                'relative flex h-16 flex-col items-center justify-center gap-1 text-xs',
                isActive(n.href) ? 'font-semibold text-accent' : 'text-muted',
              )}
            >
              <n.icon size={22} />
              {n.label}
              {n.href === '/approvals' && pending > 0 && (
                <span className="absolute right-[calc(50%-20px)] top-2 size-2 rounded-full bg-warn" aria-label={`대기 ${pending}건`} />
              )}
            </Link>
          ))}
        </nav>
      </div>
    </MeContext.Provider>
  );
}
