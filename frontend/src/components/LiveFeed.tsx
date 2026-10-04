import { useMemo, useState } from 'react'
import { Radio, Inbox } from 'lucide-react'
import type { ScanEvent } from '../types'
import { absoluteTime, countryFlag, relativeTime, truncate } from '../lib/format'
import { Card, EmptyState, SectionHeader, Skeleton, VerdictBadge } from './ui'

type Filter = 'all' | 'Suspicious' | 'Normal'

export default function LiveFeed({
  events,
  ready,
  error,
}: {
  events: ScanEvent[] | null
  ready: boolean
  error: string | null
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = useMemo(() => {
    if (!events) return []
    if (filter === 'all') return events
    return events.filter((e) => e.verdict === filter)
  }, [events, filter])

  return (
    <section id="feed">
      <Card className="p-5 sm:p-6">
        <SectionHeader
          eyebrow="Real time"
          title="Live Detection Feed"
          subtitle="Auto-refreshing every 4 seconds · newest first."
          right={
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                <Radio className="h-3.5 w-3.5 animate-pulse-dot" />
                Streaming
              </span>
              <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
                {(['all', 'Suspicious', 'Normal'] as Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-md px-2.5 py-1 font-medium capitalize transition ${
                      filter === f
                        ? 'bg-brand-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {f === 'all' ? 'All' : f}
                  </button>
                ))}
              </div>
            </div>
          }
        />

        {error && !ready && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Connecting to backend…
          </div>
        )}

        {!ready && !events ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            title="No events to show"
            hint="Run a scan above to generate detections."
          />
        ) : (
          <div className="scroll-thin max-h-[30rem] space-y-2 overflow-y-auto pr-1">
            {filtered.map((e) => (
              <FeedRow key={e.id} event={e} />
            ))}
          </div>
        )}
      </Card>
    </section>
  )
}

function ActionBadge({ action }: { action?: string }) {
  if (!action) return null
  const cfg = {
    BLOCK: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    ALLOW: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    REVIEW: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  }[action] ?? 'bg-white/10 text-slate-300 border-white/20'
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider ${cfg}`}>
      {action}
    </span>
  )
}

function FeedRow({ event }: { event: ScanEvent }) {
  const isThreat = event.verdict === 'Suspicious'
  const geo = [event.city, event.country].filter((p) => p && p !== 'Private').join(', ')

  return (
    <div
      className={`group flex items-start gap-3 rounded-xl border p-3 transition-colors ${
        isThreat
          ? 'border-rose-500/20 bg-rose-500/[0.04] hover:bg-rose-500/[0.08]'
          : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
      }`}
    >
      {/* Left accent bar */}
      <span
        className={`mt-0.5 h-full min-h-[2.5rem] w-1 shrink-0 rounded-full ${
          isThreat ? 'bg-rose-500/70' : 'bg-emerald-500/50'
        }`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={event.verdict} />
          {/* Action badge (new v2 field) */}
          <ActionBadge action={event.action} />
          {event.attack_type && (
            <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-300">
              {event.attack_type}
            </span>
          )}
          {event.disagreement && (
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              ⚡ disagreement
            </span>
          )}
          <span
            className="ml-auto shrink-0 text-[11px] text-slate-500"
            title={absoluteTime(event.ts)}
          >
            {relativeTime(event.ts)}
          </span>
        </div>

        <code className="mt-1.5 block break-all font-mono text-xs text-slate-300">
          {truncate(event.query, 96)}
        </code>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {event.source_ip && (
            <span className="inline-flex items-center gap-1">
              <span className="text-sm leading-none">
                {countryFlag(event.country)}
              </span>
              <span className="font-mono text-slate-400">{event.source_ip}</span>
            </span>
          )}
          {geo && <span>{geo}</span>}
          {event.method && event.path && (
            <span className="font-mono">
              {event.method} {event.path}
            </span>
          )}
          <span className="tabular-nums">
            {(event.confidence * 100).toFixed(event.confidence < 0.01 ? 2 : 0)}%
            conf.
          </span>
          {event.latency_ms != null && (
            <span className="tabular-nums text-slate-600">{event.latency_ms.toFixed(1)} ms</span>
          )}
          {event.session_id && (
            <span className="font-mono text-brand-400/70">#{event.session_id.slice(0, 8)}</span>
          )}
        </div>
      </div>
    </div>
  )
}
