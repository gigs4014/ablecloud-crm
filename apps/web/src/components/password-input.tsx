'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { EyeIcon, EyeOffIcon } from './icons';
import { cx } from './ui';

/** 오른쪽 눈 모양 버튼을 누르면 비밀번호를 보이거나 숨깁니다. */
export function PasswordInput({ className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={cx(className, 'w-full pr-12')}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
        aria-pressed={visible}
        title={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[10px] text-muted hover:text-ink"
      >
        {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </div>
  );
}
