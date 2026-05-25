// Thin fetch wrappers around the SQLInsight Flask API.
// All paths are RELATIVE so they work in dev (Vite proxy) and prod (same origin).

import type {
  EventsResponse,
  HealthResponse,
  ModelResponse,
  ScanEvent,
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

export function getEvents(
  limit = 50,
  verdict?: 'Suspicious' | 'Normal',
  signal?: AbortSignal,
): Promise<EventsResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (verdict) params.set('verdict', verdict)
  return getJson<EventsResponse>(`/api/events?${params.toString()}`, signal)
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
