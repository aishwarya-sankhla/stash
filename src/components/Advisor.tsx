import { ArrowDownRight, ArrowUpRight, Eye, LifeBuoy, Lightbulb, Percent, PartyPopper, Siren, Sunset, type LucideIcon } from 'lucide-react'
import { buildReport, type PlanItem, type PortfolioClass, type Severity } from '../advisor'
import { formatCompactINR, formatINR, formatPct, formatRate } from '../format'
import type { SetData } from '../store'
import type { AppData } from '../types'
import { Goals } from './Goals'
import { IconTile, PageHeader, Progress, Stat, type Tint } from './ui'

const SEVERITY: Record<Severity, { label: string; group: string; icon: LucideIcon; tint: Tint }> = {
  critical: { label: 'Do first', group: 'Do first', icon: Siren, tint: 'rose' },
  warning: { label: 'Heads up', group: 'Heads up', icon: Eye, tint: 'butter' },
  tip: { label: 'Tip', group: 'Tips', icon: Lightbulb, tint: 'lilac' },
  good: { label: 'On track', group: 'On track', icon: PartyPopper, tint: 'mint' },
}
const SEVERITIES: Severity[] = ['critical', 'warning', 'tip', 'good']
const CLASSES: PortfolioClass[] = ['equity', 'debt', 'gold']

export function Advisor({ data, setData, currentMonth, onSetupProfile }: { data: AppData; setData: SetData; currentMonth: string; onSetupProfile: () => void }) {
  const r = buildReport(data, currentMonth)
  const plan = r.monthlyPlan
  const overBy = plan.sipTotal - Math.max(0, plan.saved)
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

      <Goals data={data} setData={setData} statuses={r.goals} />

      {r.retirement && (
        <section className="card retirement">
          <div className="card-head">
            <h2>Retirement at {data.profile.retirementAge}</h2>
            <span className="muted small">
              {r.retirement.years} years away · in today's money
            </span>
          </div>
          <div className="retire-figures">
            <div>
              <span className="retire-label">On course for</span>
              <span className="retire-amount">{formatCompactINR(r.retirement.projected / r.retirement.inflator)}</span>
            </div>
            <div>
              <span className="retire-label">Needed</span>
              <span className="retire-amount muted-amount">{formatCompactINR(r.retirement.needed / r.retirement.inflator)}</span>
            </div>
            <div className={`retire-verdict ${r.retirement.extraMonthly > 0 ? 'short' : 'ok'}`}>
              <Sunset size={18} />
              {r.retirement.extraMonthly > 0 ? (
                <span>
                  Invest <b>{formatINR(r.retirement.extraMonthly)}</b> more a month to close the gap
                </span>
              ) : (
                <span>On track for your current lifestyle</span>
              )}
            </div>
          </div>
          <Progress fraction={Math.min(1, r.retirement.projected / r.retirement.needed)} />
          <p className="muted small">
            {formatINR(r.retirement.current)} in long-term holdings plus {formatINR(r.retirement.monthlySip)}/month of SIPs, growing {formatRate(r.retirement.assumedReturn)} a
            year. Needed is 30× your yearly spending then, after 6% inflation. Open “Why?” on the retirement tip below for the full working; set your retirement age in Settings.
          </p>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>What to do next</h2>
          <span className="muted small">Most important first</span>
        </div>
        {SEVERITIES.filter((sev) => counts[sev]).map((sev) => (
          <div key={sev} className={`advice-group sev-${sev}`}>
            <h3 className="advice-group-label">
              {SEVERITY[sev].group} <span className="advice-count">{counts[sev]}</span>
            </h3>
            <ul className="advice">
              {r.advice
                .filter((a) => a.severity === sev)
                .map((a) => (
                  <li key={a.id} className="advice-item">
                    <IconTile icon={SEVERITY[sev].icon} tint={SEVERITY[sev].tint} size="sm" />
                    <div className="advice-body">
                      <div className="advice-title">{a.title}</div>
                      <div className="advice-detail">{a.detail}</div>
                      {a.id === 'profile' && (
                        <button className="primary advice-action" onClick={onSetupProfile}>
                          Set up profile
                        </button>
                      )}
                      <details className="advice-why">
                        <summary>Why?</summary>
                        <ul>
                          {a.why.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>

      <div className="grid2">
        <section className="card plan-card">
          <div className="card-head">
            <h2>Your monthly game plan</h2>
          </div>
          {plan.sipTotal === 0 && plan.extraTotal === 0 ? (
            <p className="empty">No monthly surplus to put to work yet.</p>
          ) : (
            <>
              <div className="plan-total">
                {formatINR(plan.extraTotal > 0 ? plan.extraTotal : plan.sipTotal)}
                <span>
                  {plan.sipTotal === 0
                    ? 'to put to work each month'
                    : plan.extraTotal > 0
                      ? `extra to invest each month, on top of your ${formatINR(plan.sipTotal)} of SIPs`
                      : 'going into your SIPs each month'}
                </span>
              </div>
              <div className="plan-bar">
                {plan.sips.map((p) => (
                  <span key={`sip-${p.label}`} className={`seg sip tone-${p.tone}`} style={{ flexGrow: p.amount }} title={`SIPs: ${p.label}`} />
                ))}
                {plan.extra.map((p) => (
                  <span key={p.label} className={`seg tone-${p.tone}`} style={{ flexGrow: p.amount }} title={p.label} />
                ))}
              </div>
              {plan.sips.length > 0 && <PlanList title="Already going in through SIPs" items={plan.sips} total={plan.sipTotal} />}
              {plan.extra.length > 0 && <PlanList title={plan.sips.length > 0 ? 'Extra to invest' : undefined} items={plan.extra} total={plan.extraTotal} />}
              {r.monthsUsed === 0 ? (
                <p className="plan-note">Log a full month of income and expenses to see how much is left after your SIPs.</p>
              ) : (
                overBy > 0 && (
                  <p className="plan-note">
                    Your SIPs are {formatINR(overBy)} a month more than you saved on average ({formatINR(Math.max(0, plan.saved))}). Check they're all still running, and that SIP money isn't
                    also logged as an expense.
                  </p>
                )
              )}
            </>
          )}
          <p className="muted small">
            {plan.sipTotal > 0 ? 'Your SIPs come out of what you save. What’s left goes to the emergency fund' : 'Emergency fund first'}, then high-interest debt, then your goals, then
            long-term investments, split so {plan.sipTotal > 0 ? 'SIPs and extra together match' : 'they match'} your target mix.
          </p>
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
          <p className="muted small">Long-term money only: excludes your emergency fund (cash and anything switched to emergency fund), real estate and holdings linked to goals.</p>
        </section>
      </div>
      <p className="disclaimer">
        General, rule-based guidance, not personalised financial advice. Tax figures are estimates using the capital-gains rules in force since July 2024 and your
        slab; check current rules before acting. Talk to a SEBI-registered investment adviser before big decisions.
      </p>
    </div>
  )
}

function PlanList({ title, items, total }: { title?: string; items: PlanItem[]; total: number }) {
  return (
    <>
      {title && (
        <div className="plan-sub">
          <span>{title}</span>
          <span>{formatINR(total)}</span>
        </div>
      )}
      <ul className="plan-list">
        {items.map((p) => (
          <li key={p.label}>
            <span className={`legend-dot tone-${p.tone}`} />
            <span className="legend-name">
              {p.label}
              {p.detail && <small>{p.detail}</small>}
            </span>
            <span className="legend-amt">{formatINR(p.amount)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
