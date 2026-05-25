import { Database, Shield } from 'lucide-react'
import type { HealthResponse } from '../types'

const NAV_LINKS = [
  { href: '#scanner', label: 'Scanner' },
  { href: '#overview', label: 'Overview' },
  { href: '#timeline', label: 'Timeline' },
  { href: '#sources', label: 'Sources' },
  { href: '#feed', label: 'Live Feed' },
  { href: '#model', label: 'Model' },
]

export default function Navbar({
  health,
  healthError,
}: {
  health: HealthResponse | null
  healthError: string | null
}) {
  const online = !!health && health.status === 'ok' && !healthError

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-900/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <a href="#top" className="group flex items-center gap-2.5">
          <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-400 shadow-glow">
            <Shield className="h-5 w-5 text-white" strokeWidth={2.5} />
            <Database
              className="absolute h-3 w-3 text-white/90"
              style={{ top: '11px' }}
              strokeWidth={2.5}
            />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-white">
            SQL<span className="gradient-text">Insight</span>
          </span>
        </a>

        {/* Center nav links */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* Status cluster */}
        <div className="flex items-center gap-3">
          <div
            className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 sm:flex"
            title={
              online
                ? `Backend online · v${health?.version}`
                : 'Backend unreachable'
            }
          >
            <span className="relative flex h-2 w-2">
              {online && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  online ? 'bg-emerald-400 animate-pulse-dot' : 'bg-rose-500'
                }`}
              />
            </span>
            <span
              className={`text-xs font-semibold ${
                online ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {online ? 'Live' : 'Offline'}
            </span>
          </div>

          <div className="hidden items-center gap-1.5 text-xs text-slate-500 lg:flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                health?.model_loaded ? 'bg-brand-400' : 'bg-slate-600'
              }`}
            />
            Model {health?.model_loaded ? 'loaded' : '—'}
          </div>
        </div>
      </div>
    </header>
  )
}
