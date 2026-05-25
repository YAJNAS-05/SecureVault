import { Globe2, Network } from 'lucide-react'
import type { ByCountry, TopIp } from '../types'
import { countryFlag } from '../lib/format'
import { Card, EmptyState, SectionHeader, Skeleton } from './ui'

export default function Sources({
  topIps,
  byCountry,
}: {
  topIps: TopIp[] | null
  byCountry: ByCountry[] | null
}) {
  return (
    <section id="sources" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TopIpsCard topIps={topIps} />
      <ByCountryCard byCountry={byCountry} />
    </section>
  )
}

function TopIpsCard({ topIps }: { topIps: TopIp[] | null }) {
  return (
    <Card className="p-5 sm:p-6">
      <SectionHeader
        eyebrow="Origins"
        title="Top Source IPs"
        subtitle="Most active addresses by request volume."
      />
      {!topIps ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : topIps.length === 0 ? (
        <EmptyState
          icon={<Network className="h-8 w-8" />}
          title="No source data yet"
        />
      ) : (
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="pb-2 font-medium">Source IP</th>
                <th className="pb-2 font-medium">Origin</th>
                <th className="pb-2 text-right font-medium">Requests</th>
              </tr>
            </thead>
            <tbody>
              {topIps.map((row) => {
                const max = topIps[0]?.count || 1
                const pct = (row.count / max) * 100
                return (
                  <tr
                    key={row.ip}
                    className="group border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="py-2.5 font-mono text-slate-200">{row.ip}</td>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-slate-400">
                        <span className="text-base leading-none">
                          {countryFlag(row.country)}
                        </span>
                        {row.country}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-white/5 sm:block">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-6 text-right font-semibold tabular-nums text-white">
                          {row.count}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function ByCountryCard({ byCountry }: { byCountry: ByCountry[] | null }) {
  const max = byCountry?.reduce((m, c) => Math.max(m, c.count), 0) || 1
  return (
    <Card className="p-5 sm:p-6">
      <SectionHeader
        eyebrow="Geography"
        title="Traffic by Country"
        subtitle="Where inspected requests originate."
      />
      {!byCountry ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : byCountry.length === 0 ? (
        <EmptyState icon={<Globe2 className="h-8 w-8" />} title="No geo data yet" />
      ) : (
        <div className="space-y-3">
          {byCountry.map((c) => {
            const pct = (c.count / max) * 100
            return (
              <div key={c.country} className="flex items-center gap-3">
                <span className="flex w-16 shrink-0 items-center gap-1.5 text-sm text-slate-300">
                  <span className="text-base leading-none">
                    {countryFlag(c.country)}
                  </span>
                  {c.country}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300 transition-all duration-700"
                    style={{ width: `${Math.max(pct, 4)}%` }}
                  />
                </div>
                <span className="w-6 text-right text-sm font-semibold tabular-nums text-white">
                  {c.count}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
