import { buildReport, type PortfolioClass, type Severity } from '../advisor'
import { formatINR, formatPct } from '../format'
import type { AppData } from '../types'
import { Progress, Stat } from './ui'

const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Do first', warning: 'Attention', tip: 'Tip', good: 'On track' }
const CLASSES: PortfolioClass[] = ['equity', 'debt', 'gold']

export function Advisor({ data, currentMonth }: { data: AppData; currentMonth: string }) {
  const r = buildReport(data, currentMonth)
  const planTotal = r.monthlyPlan.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="stack">
      <h1>Advisor</h1>
      <div className="stats">
        <Stat label={`Avg income (${r.monthsUsed} mo)`} value={formatINR(r.avgIncome)} tone="pos" />
        <Stat label={`Avg expenses (${r.monthsUsed} mo)`} value={formatINR(r.avgExpenses)} tone="neg" />
        <Stat label="Savings rate" value={r.savingsRate === null ? '—' : formatPct(r.savingsRate)} />
        <div className="stat">
          <div className="stat-label">Emergency fund</div>
          <div className="stat-value">
            {formatINR(r.emergencyCurrent)} <span className="muted small">/ {formatINR(r.emergencyTarget)}</span>
          </div>
          {r.emergencyTarget > 0 && <Progress fraction={Math.min(1, r.emergencyCurrent / r.emergencyTarget)} />}
        </div>
      </div>

      <section className="card">
        <h2>Recommendations</h2>
        <ul className="advice">
          {r.advice.map((a) => (
            <li key={a.id} className={`advice-item ${a.severity}`}>
              <span className={`badge ${a.severity}`}>{SEVERITY_LABEL[a.severity]}</span>
              <div>
                <div className="advice-title">{a.title}</div>
                <div className="muted">{a.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid2">
        <section className="card">
          <h2>Suggested monthly plan</h2>
          {r.monthlyPlan.length === 0 ? (
            <p className="muted">No monthly surplus to allocate yet.</p>
          ) : (
            <table>
              <tbody>
                {r.monthlyPlan.map((p) => (
                  <tr key={p.label}>
                    <td>{p.label}</td>
                    <td className="num">{formatINR(p.amount)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Total monthly surplus</td>
                  <td className="num">{formatINR(planTotal)}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="muted small">Order: emergency fund → high-interest debt → investments split by your target allocation.</p>
        </section>
        <section className="card">
          <h2>Allocation: current vs target</h2>
          <p className="muted small">
            Based on age {data.profile.age}, {data.profile.riskTolerance} risk. Excludes cash (emergency fund) and real estate.
          </p>
          {CLASSES.map((c) => (
            <div key={c} className="alloc-row">
              <span className="alloc-label">{c[0].toUpperCase() + c.slice(1)}</span>
              <div className="alloc-bars">
                <div className="alloc-bar current" style={{ width: `${(r.currentAllocation?.[c] ?? 0) * 100}%` }} />
                <div className="alloc-bar target" style={{ width: `${r.targetAllocation[c] * 100}%` }} />
              </div>
              <span className="alloc-nums">
                {r.currentAllocation ? formatPct(r.currentAllocation[c]) : '—'} / {formatPct(r.targetAllocation[c])}
              </span>
            </div>
          ))}
          <div className="legend small">
            <span className="swatch current" /> Current <span className="swatch target" /> Target
          </div>
        </section>
      </div>
      <p className="disclaimer">
        These are general, rule-based guidelines, not personalised financial advice. They don't account for taxes, your goals or
        specific products. Consult a SEBI-registered investment adviser before making major decisions.
      </p>
    </div>
  )
}
