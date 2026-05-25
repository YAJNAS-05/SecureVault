import { Shield } from 'lucide-react'
import type { HealthResponse, ModelResponse } from '../types'

export default function Footer({
  health,
  model,
}: {
  health: HealthResponse | null
  model: ModelResponse | null
}) {
  return (
    <footer className="mt-16 border-t border-white/5 py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-xs text-slate-500 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-brand-400" />
          <span className="font-semibold text-slate-400">SQLInsight</span>
          <span>· ML-powered SQL injection IDS</span>
        </div>
        <div className="flex items-center gap-4">
          {model && <span>{model.model}</span>}
          {model?.sklearn_version && <span>scikit-learn {model.sklearn_version}</span>}
          {health && <span>API v{health.version}</span>}
        </div>
      </div>
    </footer>
  )
}
