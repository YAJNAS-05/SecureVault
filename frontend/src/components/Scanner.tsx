import { useState } from 'react'
import {
  AlertTriangle,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react'
import { postScan } from '../lib/api'
import type { ScanEvent } from '../types'
import { absoluteTime, clamp, countryFlag } from '../lib/format'
import { VerdictBadge } from './ui'

const EXAMPLES: { label: string; payload: string; malicious: boolean }[] = [
  { label: "admin' OR '1'='1", payload: "admin' OR '1'='1", malicious: true },
  {
    label: 'UNION SELECT credentials',
    payload: 'UNION SELECT username,password FROM users--',
    malicious: true,
  },
  { label: "pg_sleep(10) blind", payload: "' OR pg_sleep(10)--", malicious: true },
  {
    label: "1; DROP TABLE users--",
    payload: "1; DROP TABLE users--",
    malicious: true,
  },
  { label: 'blue running shoes', payload: 'blue running shoes', malicious: false },
  {
    label: 'wireless headphones',
    payload: 'best wireless headphones under 100',
    malicious: false,
  },
]

export default function Scanner({ onScanned }: { onScanned?: () => void }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<ScanEvent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function analyze(payload?: string) {
    const q = (payload ?? query).trim()
    if (!q) return
    if (payload) setQuery(payload)
    setLoading(true)
    setError(null)
    try {
      const event = await postScan(q)
      setResult(event)
      onScanned?.()
    } catch (e) {
      setError((e as Error).message || 'Scan failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="scanner" className="relative pt-10 sm:pt-16">
      {/* Hero copy */}
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3.5 py-1.5 text-xs font-medium text-brand-300">
          <Sparkles className="h-3.5 w-3.5" />
          ML-powered intrusion detection · Logistic Regression
        </div>
        <h1 className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl md:text-6xl">
          Detect SQL Injection
          <br />
          Threats <span className="gradient-text">Before They Strike</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-slate-400 sm:text-lg">
          SQLInsight inspects every query in real time with a logistic-regression
          classifier trained on 148K+ samples, flagging tautologies, UNION
          attacks, time-based blind probes and more.
        </p>
      </div>

      {/* Scanner panel */}
      <div className="mx-auto mt-10 max-w-3xl">
        <div className="glass rounded-2xl p-2 shadow-glow">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void analyze()
                }}
                placeholder="Paste a SQL query or payload…"
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-xl border border-white/10 bg-ink-900/60 py-3.5 pl-11 pr-4 font-mono text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <button
              onClick={() => void analyze()}
              disabled={loading || !query.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-400 px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:from-brand-500 hover:to-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Target className="h-4 w-4" />
              )}
              {loading ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>

          {/* Example chips */}
          <div className="flex flex-wrap items-center gap-2 px-2 py-3">
            <span className="text-xs font-medium text-slate-500">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.payload}
                onClick={() => void analyze(ex.payload)}
                className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                  ex.malicious
                    ? 'border-rose-500/20 bg-rose-500/5 text-rose-300/90 hover:border-rose-500/40 hover:bg-rose-500/10'
                    : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300/90 hover:border-emerald-500/40 hover:bg-emerald-500/10'
                }`}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {result && <ResultCard event={result} />}
      </div>
    </section>
  )
}

function ResultCard({ event }: { event: ScanEvent }) {
  const isThreat = event.verdict === 'Suspicious'
  const pct = clamp(event.confidence * 100)
  const geo = [event.city, event.region, event.country]
    .filter((p) => p && p !== 'Private')
    .join(', ')

  return (
    <div
      key={event.id}
      className={`mt-5 animate-scale-in overflow-hidden rounded-2xl border shadow-card ${
        isThreat
          ? 'border-rose-500/30 bg-gradient-to-br from-rose-950/40 to-ink-700/60'
          : 'border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 to-ink-700/60'
      }`}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                isThreat
                  ? 'bg-rose-500/15 text-rose-400'
                  : 'bg-emerald-500/15 text-emerald-400'
              }`}
            >
              {isThreat ? (
                <AlertTriangle className="h-6 w-6" />
              ) : (
                <ShieldCheck className="h-6 w-6" />
              )}
            </span>
            <div>
              <VerdictBadge verdict={event.verdict} size="lg" />
              <div className="mt-1 text-sm text-slate-400">
                {isThreat
                  ? event.attack_type ?? 'Potential injection'
                  : 'No injection signature detected'}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-3xl font-extrabold tabular-nums text-white">
              {pct.toFixed(pct < 1 ? 2 : 1)}
              <span className="text-lg text-slate-400">%</span>
            </div>
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Confidence
            </div>
          </div>
        </div>

        {/* Confidence gauge */}
        <div className="mt-5">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                isThreat
                  ? 'bg-gradient-to-r from-rose-600 to-rose-400'
                  : 'bg-gradient-to-r from-emerald-600 to-emerald-400'
              }`}
              style={{ width: `${Math.max(pct, 2)}%` }}
            />
          </div>
        </div>

        {/* Query echo */}
        <div className="mt-5 rounded-xl border border-white/5 bg-ink-900/50 p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Inspected payload
          </div>
          <code className="block break-all font-mono text-sm text-slate-200">
            {event.query}
          </code>
        </div>

        {/* Meta row */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
          {event.source_ip && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-base leading-none">
                {countryFlag(event.country)}
              </span>
              <span className="font-mono text-slate-300">{event.source_ip}</span>
            </span>
          )}
          {geo && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {geo}
            </span>
          )}
          {event.method && event.path && (
            <span className="font-mono">
              {event.method} {event.path}
            </span>
          )}
          <span title={absoluteTime(event.ts)} className="ml-auto text-slate-500">
            just now
          </span>
        </div>
      </div>
    </div>
  )
}
