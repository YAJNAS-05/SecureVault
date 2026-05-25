// Small formatting helpers used across the dashboard.

/** Relative time like "12s ago", "5m ago", "3h ago". */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const sec = Math.max(0, Math.round(diffMs / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  return `${day}d ago`
}

/** Absolute, locale-aware timestamp for tooltips. */
export function absoluteTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Compact number formatting, e.g. 117346 -> "117.3K". */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)
}

export function thousands(n: number): string {
  return new Intl.NumberFormat().format(n)
}

/**
 * Turn a 2-letter ISO country code into a flag emoji.
 * Falls back to a globe for unknown / "Local" codes.
 */
export function countryFlag(code: string | null | undefined): string {
  if (!code) return '🌐'
  const cc = code.trim().toUpperCase()
  if (cc.length !== 2 || cc === 'LO') return '🌐'
  const A = 0x1f1e6
  const base = 'A'.charCodeAt(0)
  const chars = [...cc].map((c) => {
    const idx = c.charCodeAt(0) - base
    if (idx < 0 || idx > 25) return null
    return String.fromCodePoint(A + idx)
  })
  if (chars.some((c) => c === null)) return '🌐'
  return chars.join('')
}

/** Truncate a payload string for display, keeping it readable. */
export function truncate(s: string, max = 64): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

export function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n))
}
