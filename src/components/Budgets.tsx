import { summarizeMonth } from '../finance'
import { formatINR, formatMonth } from '../format'
import type { SetData } from '../store'
import { EXPENSE_CATEGORIES, type AppData } from '../types'
import { Progress } from './ui'

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

  return (
    <div className="stack">
      <div className="row between">
        <h1>Budgets</h1>
        <span className="muted">
          {formatMonth(currentMonth)} · {formatINR(totalSpent)} of {formatINR(totalBudget)} budgeted
        </span>
      </div>
      <section className="card">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Monthly limit (₹)</th>
              <th style={{ width: '40%' }}>This month</th>
              <th className="num">Spent</th>
            </tr>
          </thead>
          <tbody>
            {EXPENSE_CATEGORIES.map((c) => {
              const limit = data.budgets[c]
              const s = spent[c] ?? 0
              return (
                <tr key={c}>
                  <td>{c}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      placeholder="No limit"
                      value={limit ?? ''}
                      onChange={(e) => setLimit(c, e.target.value)}
                    />
                  </td>
                  <td>{limit ? <Progress fraction={s / limit} /> : <span className="muted">—</span>}</td>
                  <td className={`num ${limit && s > limit ? 'neg' : ''}`}>{formatINR(s)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
