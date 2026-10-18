import { ArrowDownRight, ArrowUpRight, Eye, LifeBuoy, Lightbulb, Percent, PartyPopper, Siren, type LucideIcon } from 'lucide-react'
import { buildReport, type PortfolioClass, type Severity } from '../advisor'
import { formatINR, formatPct } from '../format'
import type { AppData } from '../types'
import { IconTile, PageHeader, Progress, Stat, type Tint } from './ui'

const SEVERITY: Record<Severity, { label: string; icon: LucideIcon; tint: Tint }> = {
  critical: { label: 'Do first', icon: Siren, tint: 'rose' },
  warning: { label: 'Heads up', icon: Eye, tint: 'butter' },
  tip: { label: 'Tip', icon: Lightbulb, tint: 'lilac' },
  good: { label: 'On track', icon: PartyPopper, tint: 'mint' },
}
const CLASSES: PortfolioClass[] = ['equity', 'debt', 'gold']

export function Advisor({ data, currentMonth, onSetupProfile }: { data: AppData; currentMonth: string; onSetupProfile: () => void }) {
  const r = buildReport(data, currentMonth)
  const planTotal = r.monthlyPlan.reduce((s, p) => s + p.amount, 0)
  const counts = r.advice.reduce<Partial<Record<Severity, number>>>((acc, a) => ({ ...acc, [a.severity]: (acc[a.severity] ?? 0) + 1 }), {})

  return (
    <div className="stack">
      <PageHeader eyebrow="Your money coach" title="Advisor">
        {(['critical', 'warning', 'good'] as Severity[])
          .filter((s) => counts[s])
          .map((s) => (
            <span key={s} className={`tag sev-${s}`}>
              {counts[s]} {SEVERITY[s].label.toLowerCase()}
            </span>
          ))}
      </PageHeader>
      <div className="stats">
        <Stat label={`Avg money in · ${r.monthsUsed} mo`} value={formatINR(r.avgIncome)} icon={ArrowDownRight} tint="mint" />
        <Stat label={`Avg money out · ${r.monthsUsed} mo`} value={formatINR(r.avgExpenses)} icon={ArrowUpRight} tint="peach" />
        <Stat label="Savings rate" value={r.savingsRate === null ? '—' : formatPct(r.savingsRate)} icon={Percent} tint="sky" />
        <Stat label="Emergency fund" value={formatINR(r.emergencyCurrent)} icon={LifeBuoy} tint="butter">
          {r.emergencyTarget > 0 && (
            <>
              <Progress fraction={Math.min(1, r.emergencyCurrent / r.emergencyTarget)} />
              <div className="stat-foot">of {formatINR(r.emergencyTarget)} goal</div>
            </>
          )}
        </Stat>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>What to do next</h2>
          <span className="muted small">Most important first</span>
        </div>
        <ul className="advice">
          {r.advice.map((a) => {
            const s = SEVERITY[a.severity]
            return (
              <li key={a.id} className={`advice-item sev-${a.severity}`}>
                <IconTile icon={s.icon} tint={s.tint} />
                <div className="advice-body">
                  <div className="advice-kicker">{s.label}</div>
                  <div className="advice-title">{a.title}</div>
                  <div className="advice-detail">{a.detail}</div>
                  {a.id === 'profile' && (
                    <button className="primary advice-action" onClick={onSetupProfile}>
                      Set up profile
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="grid2">
        <section className="card plan-card">
          <div className="card-head">
            <h2>Your monthly game plan</h2>
          </div>
          {r.monthlyPlan.length === 0 ? (
            <p className="empty">No monthly surplus to put to work yet.</p>
          ) : (
            <>
              <div className="plan-total">
                {formatINR(planTotal)}
                <span>to put to work each month</span>
              </div>
              <div className="plan-bar">
                {r.monthlyPlan.map((p, i) => (
                  <span key={p.label} className={`seg seg-${i}`} style={{ flexGrow: p.amount }} title={p.label} />
                ))}
              </div>
              <ul className="plan-list">
                {r.monthlyPlan.map((p, i) => (
                  <li key={p.label}>
                    <span className={`legend-dot seg-${i}`} />
                    <span className="legend-name">{p.label}</span>
                    <span className="legend-amt">{formatINR(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="muted small">Emergency fund first, then high-interest debt, then investments split by your target mix.</p>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Mix: now vs target</h2>
            <span className="muted small">
              Age {data.profile.age} · {data.profile.riskTolerance}
            </span>
          </div>
          {CLASSES.map((c) => {
            const cur = r.currentAllocation?.[c] ?? 0
            const tgt = r.targetAllocation[c]
            return (
              <div key={c} className="alloc-row">
                <span className="alloc-label">{c[0].toUpperCase() + c.slice(1)}</span>
                <div className="alloc-track">
                  <div className="alloc-fill" style={{ width: `${cur * 100}%` }} />
                  <div className="alloc-target" style={{ left: `${tgt * 100}%` }} title={`Target ${formatPct(tgt)}`} />
                </div>
                <span className="alloc-nums">
                  {r.currentAllocation ? formatPct(cur) : '—'}
                  <span className="muted"> / {formatPct(tgt)}</span>
                </span>
              </div>
            )
          })}
          <div className="legend-inline">
            <i style={{ background: 'var(--ink)' }} /> Now <b className="target-mark" /> Target
          </div>
          <p className="muted small">Excludes cash (your emergency fund) and real estate.</p>
        </section>
      </div>
      <p className="disclaimer">
        General, rule-based guidance, not personalised financial advice. It doesn't account for taxes, goals or specific products. Talk to a SEBI-registered investment adviser before big decisions.
      </p>
    </div>
  )
}
