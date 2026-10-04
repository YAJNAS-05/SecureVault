// Thin fetch wrappers around the SQLInsight Flask API v2.
// All paths are RELATIVE so they work in dev (Vite proxy) and prod (same origin).

import type {
  DetectorsResponse,
  EventsResponse,
  HealthResponse,
  ModelResponse,
  ScanEvent,
  SessionDetailResponse,
  SessionsResponse,
  StatsResponse,
} from '../types'

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${url}`)
  }
  return (await res.json()) as T
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return getJson<HealthResponse>('/api/health', signal)
}

export function getStats(signal?: AbortSignal): Promise<StatsResponse> {
  return getJson<StatsResponse>('/api/stats', signal)
}

export function getModel(signal?: AbortSignal): Promise<ModelResponse> {
  return getJson<ModelResponse>('/api/model', signal)
}

export function getDetectors(signal?: AbortSignal): Promise<DetectorsResponse> {
  return getJson<DetectorsResponse>('/api/detectors', signal)
}

export function getEvents(
  limit = 50,
  verdict?: 'Suspicious' | 'Normal',
  signal?: AbortSignal,
  sessionId?: string,
  action?: 'BLOCK' | 'ALLOW' | 'REVIEW',
): Promise<EventsResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (verdict) params.set('verdict', verdict)
  if (sessionId) params.set('session_id', sessionId)
  if (action) params.set('action', action)
  return getJson<EventsResponse>(`/api/events?${params.toString()}`, signal)
}

export function getSessions(signal?: AbortSignal): Promise<SessionsResponse> {
  return getJson<SessionsResponse>('/api/sessions', signal)
}

export function getSession(sessionId: string, signal?: AbortSignal): Promise<SessionDetailResponse> {
  return getJson<SessionDetailResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`, signal)
}

export async function postReset(signal?: AbortSignal): Promise<{ status: string; cleared: number }> {
  const res = await fetch('/api/reset', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) {
    throw new Error(`Reset failed (${res.status})`)
  }
  return (await res.json()) as { status: string; cleared: number }
}

export async function postScan(
  query: string,
  sourceIp?: string,
  signal?: AbortSignal,
): Promise<ScanEvent> {
  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(sourceIp ? { query, source_ip: sourceIp } : { query }),
    signal,
  })
  if (!res.ok) {
    throw new Error(`Scan failed (${res.status})`)
  }
  return (await res.json()) as ScanEvent
}

export async function postEvaluate(
  payload: {
    query: string
    expected_verdict: 'Suspicious' | 'Normal'
    session_id?: string
    source_ip?: string
    path?: string
  },
  signal?: AbortSignal,
): Promise<ScanEvent> {
  const res = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
  if (!res.ok) {
    throw new Error(`Evaluate failed (${res.status})`)
  }
  return (await res.json()) as ScanEvent
}
