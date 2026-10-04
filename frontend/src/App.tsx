import { useCallback } from 'react'
import { getEvents, getHealth, getModel, getSessions, getStats, postReset } from './lib/api'
import { usePolling } from './lib/usePolling'
import Navbar from './components/Navbar'
import Scanner from './components/Scanner'
import KpiCards from './components/KpiCards'
import ThreatTimeline from './components/ThreatTimeline'
import AttackTypes from './components/AttackTypes'
import Sources from './components/Sources'
import LiveFeed from './components/LiveFeed'
import ModelPerformance from './components/ModelPerformance'
import DetectorComparison from './components/DetectorComparison'
import ActionBreakdown from './components/ActionBreakdown'
import SessionEvaluation from './components/SessionEvaluation'
import Footer from './components/Footer'

export default function App() {
  // Live polling: stats + events every 4s. Health every 10s, model every 30s, sessions every 15s.
  const health    = usePolling(getHealth, 10000)
  const stats     = usePolling(getStats, 4000)
  const events    = usePolling(
    useCallback((signal: AbortSignal) => getEvents(50, undefined, signal), []),
    4000,
  )
  const model     = usePolling(getModel, 30000)
  const sessions  = usePolling(getSessions, 15000)

  // Force-refresh stats + events immediately after a manual scan.
  const handleScanned = useCallback(() => {
    stats.refresh()
    events.refresh()
    sessions.refresh()
  }, [stats, events, sessions])

  // Clear all recorded detections, then refresh the dashboard to zero.
  const handleReset = useCallback(async () => {
    await postReset()
    stats.refresh()
    events.refresh()
    sessions.refresh()
  }, [stats, events, sessions])

  return (
    <div className="app-bg">
      <Navbar
        health={health.data}
        healthError={health.error}
        onReset={handleReset}
      />

      <main
        id="top"
        className="relative z-10 mx-auto max-w-7xl space-y-14 px-4 pb-10 sm:px-6"
      >
        <Scanner onScanned={handleScanned} />

        <section id="overview" className="space-y-4">
          <KpiCards
            stats={stats.data}
            modelAccuracy={model.data?.headline.accuracy ?? null}
          />
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ThreatTimeline timeseries={stats.data?.timeseries ?? null} />
          </div>
          <div className="lg:col-span-2">
            <AttackTypes data={stats.data?.by_type ?? null} />
          </div>
        </div>

        <Sources
          topIps={stats.data?.top_ips ?? null}
          byCountry={stats.data?.by_country ?? null}
        />

        {/* NEW: Action Breakdown (BLOCK/ALLOW/REVIEW) + Detection Latency */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ActionBreakdown stats={stats.data} />
          {/* Detector Comparison (LR vs RF vs Rule) */}
          <DetectorComparison stats={stats.data} model={model.data ?? null} />
        </div>

        <LiveFeed
          events={events.data?.events ?? null}
          ready={events.ready}
          error={events.error}
        />

        {/* NEW: Session Evaluation (Red-Team) */}
        <SessionEvaluation
          sessions={sessions.data?.sessions ?? null}
          ready={sessions.ready}
        />

        <ModelPerformance model={model.data} />
      </main>

      <Footer health={health.data} model={model.data} />
    </div>
  )
}
