import type { ReactNode } from 'react'

/** Glassmorphism card container. */
export function Card({
  children,
  className = '',
  hover = false,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
}) {
  return (
    <div
      className={`glass rounded-2xl shadow-card ${hover ? 'glass-hover' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/** Section heading with an eyebrow label and optional right-aligned slot. */
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-400/80">
            {eyebrow}
          </div>
        )}
        <h2 className="text-xl font-bold text-white sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

/** Verdict pill — red for Suspicious, green for Normal. */
export function VerdictBadge({
  verdict,
  size = 'sm',
}: {
  verdict: string
  size?: 'sm' | 'lg'
}) {
  const isThreat = verdict === 'Suspicious'
  const pad = size === 'lg' ? 'px-4 py-1.5 text-sm' : 'px-2.5 py-0.5 text-xs'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${pad} ${
        isThreat
          ? 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30'
          : 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isThreat ? 'bg-rose-400' : 'bg-emerald-400'
        }`}
      />
      {isThreat ? 'SUSPICIOUS' : 'NORMAL'}
    </span>
  )
}

/** Loading skeleton block. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-white/5 ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(168,85,247,0.08) 50%, rgba(255,255,255,0.03) 75%)',
        backgroundSize: '200% 100%',
      }}
    />
  )
}

/** Soft empty / connecting placeholder. */
export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode
  title: string
  hint?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon && <div className="text-slate-500">{icon}</div>}
      <div className="text-sm font-medium text-slate-300">{title}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  )
}
