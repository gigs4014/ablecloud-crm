import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx('rounded-2xl border border-line bg-surface p-5 sm:p-6', className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, id, action }: { title: string; id?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id={id} className="text-[17px] font-bold">
        {title}
      </h2>
      {action}
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'inverse' | 'ghost';

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-accent text-white hover:bg-accent-strong',
    secondary: 'border border-line-strong bg-surface text-ink-2 hover:bg-surface-muted',
    inverse: 'bg-surface text-ink hover:opacity-90',
    ghost: 'text-ink-2 hover:bg-surface-muted',
  };
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-11 px-5 text-[15px]' : 'h-9 px-3 text-[13px]',
        styles[variant],
        className,
      )}
      {...rest}
    />
  );
}

type Tone = 'accent' | 'warn' | 'ok' | 'danger' | 'neutral';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const tones: Record<Tone, string> = {
    accent: 'bg-accent-soft text-accent-ink',
    warn: 'bg-warn-soft text-warn-ink',
    ok: 'bg-ok-soft text-ok-ink',
    danger: 'bg-danger-soft text-danger-ink',
    neutral: 'bg-surface-muted text-ink-2',
  };
  return (
    <span className={cx('inline-flex h-fit shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm font-medium text-danger-ink">
      {children}
    </p>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-surface-muted', className)} aria-hidden="true" />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}
