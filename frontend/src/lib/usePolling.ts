import { useCallback, useEffect, useRef, useState } from 'react'

export interface PollingState<T> {
  data: T | null
  error: string | null
  loading: boolean
  /** True once at least one successful fetch has completed. */
  ready: boolean
  refresh: () => void
}

/**
 * Polls an async fetcher on an interval. Aborts in-flight requests on unmount,
 * keeps the last good data on transient errors, and exposes a manual refresh.
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs = 4000,
): PollingState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)

  // Keep the latest fetcher without retriggering the effect each render.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const tick = useCallback(async (signal: AbortSignal) => {
    try {
      const result = await fetcherRef.current(signal)
      if (signal.aborted) return
      setData(result)
      setError(null)
      setReady(true)
    } catch (err) {
      if (signal.aborted || (err as Error).name === 'AbortError') return
      setError((err as Error).message || 'Request failed')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  const [nonce, setNonce] = useState(0)
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    void tick(controller.signal)
    const id = window.setInterval(() => {
      void tick(controller.signal)
    }, intervalMs)
    return () => {
      controller.abort()
      window.clearInterval(id)
    }
  }, [tick, intervalMs, nonce])

  return { data, error, loading, ready, refresh }
}
