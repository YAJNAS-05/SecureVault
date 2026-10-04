/**
 * DetectorComparison — side-by-side runtime stats for Rule, LR, and RF detectors.
 *
 * Shows for each detector:
 *  - Total queries processed
 *  - Suspicious vs Normal counts
 *  - Suspicious rate (bar)
 *
 * Also shows the model training metrics (Accuracy / Recall / F1) from /api/model
 * so LR and RF can be compared on a research level.
 */
import { BrainCircuit, Shield } from 'lucide-react'
import type { ModelResponse, StatsResponse } from '../types'
import { Card, SectionHeader, Skeleton } from './ui'

interface Props {
  stats: StatsResponse | null
  model: ModelResponse | null
}

const DETECTOR_META: Record<string, { label: string; color: string; description: string }> = {
  rule: {
    label: 'Rule Detector',
    color: '#f59e0b',
    description: '9 regex patterns — explainable, zero false positives on canonical attacks',
  },
  lr: {
    label: 'Logistic Regression',
    color: '#a855f7',
    description: 'ML: word + char n-gram features, 80k dimensions',
  },
  rf: {
    label: 'Random Forest',
    color: '#22c55e',
    description: 'ML: ensemble of 100 trees, better boundary-case recall',
  },
}

export default function DetectorComparison({ stats, model }: Props) {
  const detStats = stats?.detector_stats ?? {}
  const hasData = Object.keys(detStats).length > 0

  return (
    <section id="detectors">
      <Card className="p-5 sm:p-6">
        <SectionHeader
          eyebrow="Multi-detector"
          title="Detector Comparison"
          subtitle="Runtime detection breakdown by detector type — Rule · LR · RF"
          right={
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300">
              <Shield className="h-4 w-4" />
              Ensemble: {(stats as any)?.ensemble_policy ?? 'any'}
            </span>
          }
        />

        {/* Runtime stats row */}
        {!stats ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : hasData ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {['rule', 'lr', 'rf'].map((name) => {
              const d = detStats[name]
              const meta = DETECTOR_META[name]
              if (!d) return null
              const rate = d.total > 0 ? d.suspicious / d.total : 0
              return (
                <DetectorCard
                  key={name}
                  name={meta?.label ?? name}
                  description={meta?.description ?? ''}
                  color={meta?.color ?? '#94a3b8'}
                  total={d.total}
                  suspicious={d.suspicious}
                  normal={d.normal}
                  rate={rate}
                />
              )
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] py-8 text-sm text-slate-500">
            Run a scan to populate detector statistics.
          </div>
        )}

        {/* Training metrics comparison */}
        {model && (
          <div className="mt-6">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Training Metrics Comparison
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ModelMetricsCard
                title="Logistic Regression"
                color="#a855f7"
                accuracy={model.headline.accuracy}
                precision={model.headline.precision}
                recall={model.headline.recall}
                f1={model.headline.f1}
                unseenRecall={model.experiment_2_unseen?.recall}
                samples={model.experiment_1?.samples}
              />
              {model.rf_headline && (
                <ModelMetricsCard
                  title="Random Forest"
                  color="#22c55e"
                  accuracy={model.rf_headline.accuracy}
                  precision={model.rf_headline.precision}
                  recall={model.rf_headline.recall}
                  f1={model.rf_headline.f1}
                  unseenRecall={model.rf_experiment_2_unseen?.recall}
                  samples={model.rf_experiment_1?.samples}
                />
              )}
            </div>
          </div>
        )}
      </Card>
    </section>
  )
}

function DetectorCard({
  name,
  description,
  color,
  total,
  suspicious,
  normal,
  rate,
}: {
  name: string
  description: string
  color: string
  total: number
  suspicious: number
  normal: number
  rate: number
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${color}22`, border: `1px solid ${color}44` }}
        >
          <BrainCircuit className="h-4 w-4" style={{ color }} />
        </span>
        <div>
          <div className="text-sm font-semibold text-white">{name}</div>
          <div className="text-[11px] leading-tight text-slate-500">{description}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <div className="text-lg font-extrabold tabular-nums text-white">{total.toLocaleString()}</div>
          <div className="text-slate-500">total</div>
        </div>
        <div>
          <div className="text-lg font-extrabold tabular-nums text-rose-300">{suspicious.toLocaleString()}</div>
          <div className="text-slate-500">suspicious</div>
        </div>
        <div>
          <div className="text-lg font-extrabold tabular-nums text-emerald-300">{normal.toLocaleString()}</div>
          <div className="text-slate-500">normal</div>
        </div>
      </div>

      {/* Detection rate bar */}
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-slate-500">
          <span>Detection rate</span>
          <span className="font-mono text-slate-300">{(rate * 100).toFixed(1)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(rate * 100, 100)}%`, background: color }}
          />
        </div>
      </div>
    </div>
  )
}

function ModelMetricsCard({
  title,
  color,
  accuracy,
  precision,
  recall,
  f1,
  unseenRecall,
  samples,
}: {
  title: string
  color: string
  accuracy: number
  precision: number
  recall: number
  f1: number
  unseenRecall?: number
  samples?: number
}) {
  const rows = [
    { label: 'Accuracy', value: accuracy },
    { label: 'Precision', value: precision },
    { label: 'Recall (in-dist)', value: recall },
    { label: 'F1 Score', value: f1 },
    ...(unseenRecall != null ? [{ label: 'Recall (unseen)', value: unseenRecall }] : []),
  ]
  return (
    <div
      className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
      style={{ borderTopColor: `${color}55`, borderTopWidth: 2 }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <span className="text-sm font-semibold text-white">{title}</span>
        {samples != null && (
          <span className="ml-auto text-[11px] text-slate-500">{samples.toLocaleString()} samples</span>
        )}
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{r.label}</span>
            <div className="flex items-center gap-2">
              <div className="h-1 w-20 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(r.value, 100)}%`, background: color, opacity: 0.8 }}
                />
              </div>
              <span className="w-14 text-right font-mono font-semibold text-slate-200">
                {r.value.toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
