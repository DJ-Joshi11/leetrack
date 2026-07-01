import { useEffect, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Difficulty } from '../lib/api'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-[0_1px_0_rgba(255,255,255,0.02)_inset] transition-colors duration-200 ${className}`}
    >
      {children}
    </div>
  )
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...rest
}: {
  children: ReactNode
  variant?: 'primary' | 'ghost' | 'danger'
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary:
      'bg-(--color-accent) text-[#06201b] hover:bg-(--color-accent-dim) hover:shadow-[0_0_20px_-4px_var(--color-accent)] font-medium',
    ghost: 'border border-(--color-border) text-(--color-text) hover:border-(--color-text-dim) hover:bg-(--color-surface-2)',
    danger: 'border border-(--color-hard)/40 text-(--color-hard) hover:bg-(--color-hard)/10',
  }
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none cursor-pointer ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  Easy: 'text-(--color-easy) bg-(--color-easy)/10 border-(--color-easy)/30',
  Medium: 'text-(--color-medium) bg-(--color-medium)/10 border-(--color-medium)/30',
  Hard: 'text-(--color-hard) bg-(--color-hard)/10 border-(--color-hard)/30',
}
const DIFFICULTY_DOT: Record<Difficulty, string> = {
  Easy: 'bg-(--color-easy)',
  Medium: 'bg-(--color-medium)',
  Hard: 'bg-(--color-hard)',
}

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-mono ${DIFFICULTY_STYLES[difficulty]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DIFFICULTY_DOT[difficulty]}`} />
      {difficulty}
    </span>
  )
}

export function TopicTag({ topic }: { topic: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 py-0.5 text-xs text-(--color-text-dim) transition-colors hover:border-(--color-text-faint)">
      {topic}
    </span>
  )
}

export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: ReactNode
  sub?: string
  icon?: LucideIcon
}) {
  return (
    <div className="group rounded-xl border border-(--color-border) bg-(--color-surface) p-5 transition-all duration-200 hover:border-(--color-text-faint) hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-(--color-text-faint)">{label}</div>
        {Icon && <Icon size={14} className="text-(--color-text-faint) transition-colors group-hover:text-(--color-accent)" />}
      </div>
      <div className="mt-2 font-mono text-3xl font-semibold text-(--color-text)">{value}</div>
      {sub && <div className="mt-1 text-xs text-(--color-text-dim)">{sub}</div>}
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--color-text-faint) border-t-(--color-accent) ${className}`}
    />
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: LucideIcon
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-(--color-border) py-16 text-center">
      {Icon && <Icon size={22} className="mb-3 text-(--color-text-faint)" />}
      <div className="text-(--color-text)">{title}</div>
      {description && <div className="mt-1 max-w-sm text-sm text-(--color-text-dim)">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-(--color-border) bg-(--color-surface-2) px-3 py-2 text-(--color-text) placeholder:text-(--color-text-faint) outline-none transition-all duration-150 focus:border-(--color-accent) focus:shadow-[0_0_0_3px_rgba(94,234,212,0.12)] ${props.className ?? ''}`}
    />
  )
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-(--color-border) bg-(--color-surface-2) px-3 py-2 font-mono text-sm text-(--color-text) placeholder:text-(--color-text-faint) outline-none transition-all duration-150 focus:border-(--color-accent) focus:shadow-[0_0_0_3px_rgba(94,234,212,0.12)] ${props.className ?? ''}`}
    />
  )
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-(--color-border) bg-(--color-surface-2) px-3 py-2 text-(--color-text) outline-none transition-all duration-150 focus:border-(--color-accent) ${props.className ?? ''}`}
    >
      {children}
    </select>
  )
}

/** A destructive action button that requires a second click within 3s to actually fire. */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Click again to confirm',
  variant = 'danger',
  className = '',
  disabled,
}: {
  onConfirm: () => void
  children: ReactNode
  confirmLabel?: string
  variant?: 'primary' | 'ghost' | 'danger'
  className?: string
  disabled?: boolean
}) {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])

  return (
    <Button
      variant={variant}
      disabled={disabled}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (confirming) {
          setConfirming(false)
          onConfirm()
        } else {
          setConfirming(true)
        }
      }}
    >
      {confirming ? confirmLabel : children}
    </Button>
  )
}
