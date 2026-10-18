import { summarizeMonth } from '../finance'
import { formatINR, formatMonth } from '../format'
import type { SetData } from '../store'
import { EXPENSE_CATEGORIES, type AppData } from '../types'
import { CategoryChip, MoneyInput, PageHeader, Progress } from './ui'

function status(spent: number, limit: number) {
  if (spent > limit) return { text: `${formatINR(spent - limit)} over`, tone: 'over' }
  if (spent >= limit * 0.8) return { text: `${formatINR(limit - spent)} left`, tone: 'near' }
  return { text: `${formatINR(limit - spent)} left`, tone: 'ok' }
}

export function Budgets({ data, setData, currentMonth }: { data: AppData; setData: SetData; currentMonth: string }) {
  const spent = summarizeMonth(data.transactions, currentMonth).byCategory

  function setLimit(category: string, value: string) {
    setData((d) => {
      const budgets = { ...d.budgets }
      const n = Number(value)
      if (value === '' || !(n > 0)) delete budgets[category]
      else budgets[category] = n
      return { ...d, budgets }
    })
  }

  const totalBudget = Object.values(data.budgets).reduce((s, v) => s + v, 0)
  const totalSpent = Object.entries(spent)
    .filter(([c]) => c in data.budgets)
    .reduce((s, [, v]) => s + v, 0)
  const budgeted = EXPENSE_CATEGORIES.filter((c) => data.budgets[c])
  const unbudgeted = EXPENSE_CATEGORIES.filter((c) => !data.budgets[c])

  return (
    <div className="stack">
      <PageHeader eyebrow={formatMonth(currentMonth)} title="Budgets">
        <div className="pill-stat">
          <span className="muted">Spent</span> <strong>{formatINR(totalSpent)}</strong> <span className="muted">of {formatINR(totalBudget)}</span>
        </div>
      </PageHeader>
      {budgeted.length > 0 && (
        <div className="budget-grid">
          {budgeted.map((c) => {
            const limit = data.budgets[c]
            const s = spent[c] ?? 0
            const st = status(s, limit)
            return (
              <section key={c} className="card budget-card">
                <div className="card-head">
                  <CategoryChip category={c} />
                  <span className={`tag ${st.tone}`}>{st.text}</span>
                </div>
                <div className="budget-amt">{formatINR(s)}</div>
                <div className="budget-limit">
                  of <MoneyInput value={limit} onCommit={(n) => setLimit(c, String(n))} label={`${c} monthly limit (0 removes it)`} />
                </div>
                <Progress fraction={s / limit} />
              </section>
            )
          })}
        </div>
      )}
      <section className="card">
        <div className="card-head">
          <h2>Set a limit</h2>
          <span className="muted small">Categories without a budget. This month's spend shown.</span>
        </div>
        <ul className="tx-list">
          {unbudgeted.map((c) => (
            <li key={c}>
              <CategoryChip category={c} />
              <span className="tx-date">{formatINR(spent[c] ?? 0)} spent</span>
              <input
                className="limit-input"
                type="number"
                min="0"
                placeholder="Add limit"
                onBlur={(e) => setLimit(c, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                aria-label={`${c} monthly limit`}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
