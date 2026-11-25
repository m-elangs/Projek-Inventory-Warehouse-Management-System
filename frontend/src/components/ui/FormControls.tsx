import React from 'react';

interface FieldWrapperProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, required, error, hint, children }: FieldWrapperProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">
        {label}
        {required && <span className="text-status-danger ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-status-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-secondary">{hint}</p>
      ) : null}
    </div>
  );
}

const baseControl =
  'w-full rounded-md border bg-surface text-ink text-[16px] placeholder:text-ink-muted transition-colors focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-canvas disabled:text-ink-secondary';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  compact?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ hasError, compact = false, className = '', ...props }, ref) => (
    <input
      ref={ref}
      className={`${baseControl} ${compact ? 'h-10 px-3.5 text-[15px]' : 'h-11 px-4 text-base'} ${
        hasError ? 'border-status-danger' : 'border-line-strong'
      } ${className}`}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
  compact?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ hasError, compact = false, className = '', children, ...props }, ref) => (
    <select
      ref={ref}
      className={`${baseControl} cursor-pointer ${
        compact ? 'h-10 px-3.5 text-[16px] font-medium' : 'h-11 px-4 text-[16px] font-medium'
      } ${
        hasError ? 'border-status-danger' : 'border-line-strong'
      } ${className}`}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ hasError, className = '', rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={`${baseControl} px-3 py-2 text-sm ${
        hasError ? 'border-status-danger' : 'border-line-strong'
      } ${className}`}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
