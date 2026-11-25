import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
  size?: 'sm' | 'md';
  loading?: boolean;
  leftIcon?: React.ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-brand text-white border-transparent hover:bg-brand-hover focus-visible:ring-brand/30',
  secondary:
    'bg-surface text-ink border-line-strong hover:bg-canvas focus-visible:ring-brand/20',
  ghost:
    'bg-transparent text-ink-secondary border-transparent hover:text-ink hover:bg-canvas focus-visible:ring-brand/20',
  danger:
    'bg-status-danger text-white border-transparent hover:opacity-95 focus-visible:ring-status-danger/30',
  'danger-outline':
    'bg-surface text-status-danger border-status-danger-border hover:bg-status-danger-bg focus-visible:ring-status-danger/20',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      disabled,
      className = '',
      children,
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center font-medium rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...rest}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : leftIcon}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
