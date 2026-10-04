// Shared API types for SQLInsight v2. Shapes mirror the live Flask backend.

export interface HealthResponse {
  status: string
  version: string
  model_loaded: boolean
  rf_model_loaded: boolean
  alerts_enabled: boolean
  ensemble_policy: string
}

// Per-detector result inside a scan event
export interface DetectorResult {
  name: 'rule' | 'lr' | 'rf' | string
  verdict: 'Suspicious' | 'Normal'
  confidence: number
  matched_rule?: string
  error?: string
}

export interface ScanEvent {
  id: number
  query: string
  prediction: 0 | 1
  confidence: number
  verdict: 'Suspicious' | 'Normal' | string
  attack_type: string | null
  // v2 fields
  action?: 'BLOCK' | 'ALLOW' | 'REVIEW' | string
  detectors?: DetectorResult[]
  disagreement?: boolean
  ensemble_confidence?: number
  latency_ms?: number
  expected_verdict?: string | null
  correct?: boolean
  // metadata
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
  session_id?: string | null
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
  // RF model (new)
  rf_model?: string
  rf_model_params?: Record<string, unknown>
  rf_headline?: Headline
  rf_experiment_1?: ExperimentMetrics
  rf_experiment_2_full?: ExperimentMetrics
  rf_experiment_2_unseen?: ExperimentMetrics
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

export interface DetectorStats {
  total: number
  suspicious: number
  normal: number
}

export interface ActionBreakdown {
  BLOCK: number
  ALLOW: number
  REVIEW: number
}

export interface LatencyStats {
  p50: number
  p95: number
  p99: number
  avg: number
  samples: number
}

export interface StatsResponse {
  totals: {
    requests: number
    attacks: number
    normal: number
    alerts: number
    attack_rate: number
    blocked: number
    allowed: number
    reviewed: number
  }
  last_24h: { attacks: number }
  timeseries: TimeseriesBucket[]
  by_type: ByType[]
  by_country: ByCountry[]
  top_ips: TopIp[]
  action_breakdown: ActionBreakdown
  detector_stats: Record<string, DetectorStats>
  latency: LatencyStats
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
  rf_model?: {
    accuracy: number
    precision: number
    recall: number
    f1: number
    generalisation?: {
      accuracy: number
      recall: number
    }
  }
}

// Session evaluation types
export interface SessionSummary {
  session_id: string
  total: number
  attacks: number
  labeled: number
  started: string
  last_seen: string
}

export interface SessionsResponse {
  sessions: SessionSummary[]
}

export interface DetectorEvalMetrics {
  tp: number
  fp: number
  fn: number
  tn: number
  precision: number
  recall: number
  f1: number
  accuracy: number
}

export interface SessionDetailResponse {
  session_id: string
  labeled_events: number
  ensemble: DetectorEvalMetrics
  detectors: Record<string, DetectorEvalMetrics>
  missed_attacks_count: number
  missed_attacks_sample: Array<{ action: string; expected: string }>
}

export interface DetectorInfo {
  name: string
  type: string
  description: string
  speed_ms_approx: number
  loaded: boolean
}

export interface DetectorsResponse {
  detectors: DetectorInfo[]
  ensemble_policy: string
}
