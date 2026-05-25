import { BrainCircuit, Info } from 'lucide-react'
import type { ConfusionMatrix, ModelResponse } from '../types'
import { compactNumber } from '../lib/format'
import { Card, SectionHeader, Skeleton } from './ui'

export default function ModelPerformance({
  model,
}: {
  model: ModelResponse | null
}) {
  return (
    <section id="model">
      <Card className="p-5 sm:p-6">
        <SectionHeader
          eyebrow="Classifier"
          title="Model Performance"
          subtitle={
            model
              ? `${model.model} · ${compactNumber(
                  model.features.n_features,
                )} features`
              : 'Evaluation metrics'
          }
          right={
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-300">
              <BrainCircuit className="h-4 w-4" />
              {model?.model ?? 'LogisticRegression'}
            </span>
          }
        />

        {!model ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Skeleton className="h-40 w-full lg:col-span-2" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Headline metrics + experiment comparison */}
            <div className="space-y-5 lg:col-span-2">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Accuracy" value={model.headline.accuracy} />
                <Metric label="Precision" value={model.headline.precision} />
                <Metric label="Recall" value={model.headline.recall} />
                <Metric label="F1 Score" value={model.headline.f1} />
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Experiment comparison
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ExperimentBlock
                    title="Experiment 1"
                    tag="in-distribution"
                    accuracy={model.experiment_1.accuracy}
                    precision={model.experiment_1.precision}
                    recall={model.experiment_1.recall}
                    f1={model.experiment_1.f1}
                    samples={model.experiment_1.samples}
                    accent="brand"
                  />
                  <ExperimentBlock
                    title="Experiment 2"
                    tag="unseen generalisation"
                    accuracy={model.experiment_2_unseen.accuracy}
                    precision={model.experiment_2_unseen.precision}
                    recall={model.experiment_2_unseen.recall}
                    f1={model.experiment_2_unseen.f1}
                    samples={model.experiment_2_unseen.samples}
                    accent="emerald"
                  />
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-slate-400">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                <span>
                  Outperforms the thesis baseline{' '}
                  <span className="font-semibold text-slate-300">
                    (84.51% → 90.35%
                  </span>{' '}
                  on unseen data), demonstrating strong generalisation beyond the
                  training distribution.
                </span>
              </div>
            </div>

            {/* Confusion matrix */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Confusion Matrix
                </span>
                <span className="text-[10px] text-slate-600">
                  Exp 1 · {compactNumber(model.experiment_1.samples)} test
                </span>
              </div>
              <ConfusionGrid cm={model.experiment_1.confusion_matrix} />
            </div>
          </div>
        )}
      </Card>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/5 bg-gradient-to-br from-brand-500/[0.07] to-transparent p-3.5">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums text-white">
        {value.toFixed(2)}
        <span className="text-sm font-semibold text-brand-300">%</span>
      </div>
    </div>
  )
}

function ExperimentBlock({
  title,
  tag,
  accuracy,
  precision,
  recall,
  f1,
  samples,
  accent,
}: {
  title: string
  tag: string
  accuracy: number
  precision: number
  recall: number
  f1: number
  samples: number
  accent: 'brand' | 'emerald'
}) {
  const ring =
    accent === 'brand' ? 'ring-brand-500/20' : 'ring-emerald-500/20'
  const dot = accent === 'brand' ? 'bg-brand-400' : 'bg-emerald-400'
  return (
    <div className={`rounded-xl border border-white/5 bg-white/[0.02] p-4 ring-1 ring-inset ${ring}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="text-sm font-semibold text-white">{title}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-slate-500">{tag}</div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Row k="Accuracy" v={accuracy} />
        <Row k="Precision" v={precision} />
        <Row k="Recall" v={recall} />
        <Row k="F1" v={f1} />
      </div>
      <div className="mt-3 border-t border-white/5 pt-2 text-[11px] text-slate-500">
        {compactNumber(samples)} samples evaluated
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{k}</span>
      <span className="font-semibold tabular-nums text-slate-200">
        {v.toFixed(2)}%
      </span>
    </div>
  )
}

function ConfusionGrid({ cm }: { cm: ConfusionMatrix }) {
  const cells = [
    {
      label: 'True Negative',
      value: cm.tn,
      sub: 'Normal → Normal',
      tone: 'good',
    },
    {
      label: 'False Positive',
      value: cm.fp,
      sub: 'Normal → Attack',
      tone: 'bad',
    },
    {
      label: 'False Negative',
      value: cm.fn,
      sub: 'Attack → Normal',
      tone: 'bad',
    },
    {
      label: 'True Positive',
      value: cm.tp,
      sub: 'Attack → Attack',
      tone: 'good',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {cells.map((c) => (
        <div
          key={c.label}
          className={`rounded-xl border p-3 ${
            c.tone === 'good'
              ? 'border-emerald-500/20 bg-emerald-500/[0.06]'
              : 'border-rose-500/20 bg-rose-500/[0.06]'
          }`}
        >
          <div
            className={`text-xl font-extrabold tabular-nums ${
              c.tone === 'good' ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {compactNumber(c.value)}
          </div>
          <div className="mt-0.5 text-[11px] font-medium text-slate-300">
            {c.label}
          </div>
          <div className="text-[10px] text-slate-500">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}
