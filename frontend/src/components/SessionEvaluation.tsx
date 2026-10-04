/**
 * SessionEvaluation — Red-Team session analysis panel.
 *
 * Lists all sessions (from GET /api/sessions) and when a session is selected
 * shows per-detector TP/FP/FN/TN, precision, recall, F1, and missed attacks.
 */
import { useCallback, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FlaskConical,
  XCircle,
} from 'lucide-react'
import { getSession } from '../lib/api'
import type { SessionDetailResponse, SessionSummary } from '../types'
import { Card, SectionHeader, Skeleton } from './ui'

interface Props {
  sessions: SessionSummary[] | null
  ready: boolean
}

export default function SessionEvaluation({ sessions, ready }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectSession = useCallback(async (id: string) => {
    if (selected === id) {
      setSelected(null)
      setDetail(null)
      return
    }
    setSelected(id)
    setDetail(null)
    setLoading(true)
    setError(null)
    try {
      const d = await getSession(id)
      setDetail(d)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load session')
    } finally {
      setLoading(false)
    }
  }, [selected])

  return (
    <section id="sessions">
      <Card className="p-5 sm:p-6">
        <SectionHeader
          eyebrow="Red-Team evaluation"
          title="Session Evaluation"
          subtitle="Per-session TP / FP / FN analysis — labeled via POST /api/evaluate"
          right={
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300">
              <FlaskConical className="h-4 w-4" />
              {sessions?.length ?? 0} session{sessions?.length !== 1 ? 's' : ''}
            </span>
          }
        />

        {!ready && !sessions ? (
          <Skeleton className="h-32 w-full" />
        ) : !sessions || sessions.length === 0 ? (
          <EmptySessionsMessage />
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.session_id}>
                <SessionRow
                  session={s}
                  isSelected={selected === s.session_id}
                  onClick={() => selectSession(s.session_id)}
                />
                {selected === s.session_id && (
                  <div className="mt-1.5 ml-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    {loading ? (
                      <Skeleton className="h-40 w-full" />
                    ) : error ? (
                      <div className="text-sm text-rose-400">{error}</div>
                    ) : detail ? (
                      <SessionDetail detail={detail} />
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  )
}

function SessionRow({
  session,
  isSelected,
  onClick,
}: {
  session: SessionSummary
  isSelected: boolean
  onClick: () => void
}) {
  const labeledPct =
    session.total > 0 ? ((session.labeled / session.total) * 100).toFixed(0) : '0'
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
        isSelected
          ? 'border-brand-500/40 bg-brand-500/10'
          : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
      }`}
    >
      <ChevronRight
        className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isSelected ? 'rotate-90' : ''}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold text-white truncate">
            {session.session_id}
          </span>
          {session.labeled > 0 && (
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
              {session.labeled} labeled
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-slate-500">
          <span>{session.total} events</span>
          <span>·</span>
          <span className="text-rose-300">{session.attacks} attacks</span>
          <span>·</span>
          <span>{labeledPct}% labeled</span>
          <span>·</span>
          <span>Last seen {formatTs(session.last_seen)}</span>
        </div>
      </div>
    </button>
  )
}

function SessionDetail({ detail }: { detail: SessionDetailResponse }) {
  if (detail.labeled_events === 0) {
    return (
      <div className="text-sm text-slate-500">
        No labeled events in this session. Use <code className="text-brand-300">POST /api/evaluate</code> with an{' '}
        <code className="text-brand-300">expected_verdict</code> to enable evaluation.
      </div>
    )
  }

  const detectorNames = Object.keys(detail.detectors)
  const allNames = ['ensemble', ...detectorNames]

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {detail.labeled_events} labeled events · {detail.missed_attacks_count} missed attacks
      </div>

      {/* Metrics table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5 text-left text-[11px] text-slate-500">
              <th className="pb-2 pr-3 font-semibold uppercase tracking-wider">Detector</th>
              <th className="pb-2 pr-3 text-right">Accuracy</th>
              <th className="pb-2 pr-3 text-right">Precision</th>
              <th className="pb-2 pr-3 text-right">Recall</th>
              <th className="pb-2 pr-3 text-right">F1</th>
              <th className="pb-2 pr-3 text-right text-emerald-400">TP</th>
              <th className="pb-2 pr-3 text-right text-rose-400">FP</th>
              <th className="pb-2 pr-3 text-right text-amber-400">FN</th>
              <th className="pb-2 text-right text-slate-400">TN</th>
            </tr>
          </thead>
          <tbody>
            {allNames.map((name) => {
              const m = name === 'ensemble' ? detail.ensemble : detail.detectors[name]
              if (!m) return null
              return (
                <tr
                  key={name}
                  className={`border-b border-white/5 ${name === 'ensemble' ? 'font-semibold text-white' : 'text-slate-300'}`}
                >
                  <td className="py-2 pr-3 font-mono">{name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.accuracy.toFixed(1)}%</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.precision.toFixed(1)}%</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.recall.toFixed(1)}%</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.f1.toFixed(1)}%</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-emerald-300">{m.tp}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-rose-300">{m.fp}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-amber-300">{m.fn}</td>
                  <td className="py-2 text-right tabular-nums text-slate-400">{m.tn}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge icon={<CheckCircle2 className="h-3.5 w-3.5" />} color="emerald" label={`${detail.ensemble.tp} TP`} />
        <Badge icon={<XCircle className="h-3.5 w-3.5" />} color="rose" label={`${detail.ensemble.fp} FP`} />
        <Badge icon={<AlertTriangle className="h-3.5 w-3.5" />} color="amber" label={`${detail.missed_attacks_count} FN (missed attacks)`} />
      </div>
    </div>
  )
}

function Badge({
  icon,
  color,
  label,
}: {
  icon: React.ReactNode
  color: 'emerald' | 'rose' | 'amber'
  label: string
}) {
  const cls = {
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  }[color]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>
      {icon}
      {label}
    </span>
  )
}

function EmptySessionsMessage() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-center">
      <FlaskConical className="mx-auto h-8 w-8 text-slate-600" />
      <div className="mt-3 text-sm font-medium text-slate-300">No sessions yet</div>
      <div className="mt-1 text-xs text-slate-500">
        Send requests with a <code className="text-brand-300">session_id</code> field to group them.
        Use <code className="text-brand-300">POST /api/evaluate</code> with{' '}
        <code className="text-brand-300">expected_verdict</code> for labeled evaluation.
      </div>
    </div>
  )
}

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}
