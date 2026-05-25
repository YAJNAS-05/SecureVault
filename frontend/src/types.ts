// Shared API types for SQLInsight. Shapes mirror the live Flask backend.

export interface HealthResponse {
  status: string
  version: string
  model_loaded: boolean
  alerts_enabled: boolean
}

export interface ScanEvent {
  id: number
  query: string
  prediction: 0 | 1
  confidence: number
  verdict: 'Suspicious' | 'Normal' | string
  attack_type: string | null
  source_ip: string | null
  country: string | null
  region: string | null
  city: string | null
  lat: number | null
  lon: number | null
  ts: string
  method: string | null
  path: string | null
  source: string | null
  alerted: 0 | 1
  user_agent?: string | null
  log_line?: string | null
}

export interface EventsResponse {
  events: ScanEvent[]
}

export interface ConfusionMatrix {
  tn: number
  fp: number
  fn: number
  tp: number
}

export interface ExperimentMetrics {
  accuracy: number
  precision: number
  recall: number
  f1: number
  confusion_matrix: ConfusionMatrix
  samples: number
  train_size?: number
  test_size?: number
}

export interface Headline {
  accuracy: number
  precision: number
  recall: number
  f1: number
}

export interface ModelResponse {
  headline: Headline
  experiment_1: ExperimentMetrics
  experiment_2_full: ExperimentMetrics
  experiment_2_unseen: ExperimentMetrics
  model: string
  model_params?: Record<string, unknown>
  features: { n_features: number; vectorizer?: string }
  datasets?: Record<string, unknown>
  sklearn_version?: string
  generated_at?: string
}

export interface TimeseriesBucket {
  bucket: string
  hour: string
  attacks: number
  normal: number
}

export interface ByType {
  type: string
  count: number
}

export interface ByCountry {
  country: string
  count: number
}

export interface TopIp {
  ip: string
  count: number
  country: string
}

export interface StatsResponse {
  totals: {
    requests: number
    attacks: number
    normal: number
    alerts: number
    attack_rate: number
  }
  last_24h: { attacks: number }
  timeseries: TimeseriesBucket[]
  by_type: ByType[]
  by_country: ByCountry[]
  top_ips: TopIp[]
  model: {
    accuracy: number
    precision: number
    recall: number
    f1: number
    generalisation: {
      accuracy: number
      precision: number
      recall: number
      f1: number
      samples: number
      confusion_matrix: ConfusionMatrix
    }
  }
}
