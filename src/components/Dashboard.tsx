import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { lastMonths, savingsRate, summarizeMonth } from '../finance'
import { formatINR, formatMonth, formatPct } from '../format'
import type { AppData } from '../types'
import { COLORS, MonthPicker, Stat } from './ui'

export function Dashboard({ data, currentMonth }: { data: AppData; currentMonth: string }) {
  const [month, setMonth] = useState(currentMonth)
  const summary = summarizeMonth(data.transactions, month)
  const rate = savingsRate(summary.income, summary.expenses)
  const netWorth = data.holdings.reduce((s, h) => s + h.currentValue, 0)

  const categories = Object.entries(summary.byCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  const trend = lastMonths(month, 6).map((m) => {
    const s = summarizeMonth(data.transactions, m)
    return { month: formatMonth(m), Income: s.income, Expenses: s.expenses }
  })

  return (
    <div className="stack">
      <div className="row between">
        <h1>Dashboard</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </div>
      <div className="stats">
        <Stat label="Income" value={formatINR(summary.income)} tone="pos" />
        <Stat label="Expenses" value={formatINR(summary.expenses)} tone="neg" />
        <Stat label="Saved" value={formatINR(summary.income - summary.expenses)} />
        <Stat label="Savings rate" value={rate === null ? '—' : formatPct(rate)} />
        <Stat label="Net worth (investments)" value={formatINR(netWorth)} />
      </div>
      <div className="grid2">
        <section className="card">
          <h2>Spending by category · {formatMonth(month)}</h2>
          {categories.length === 0 ? (
            <p className="muted">No expenses this month.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={categories} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {categories.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatINR(Number(v))} />
                <Legend layout="vertical" align="right" verticalAlign="middle" />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>
        <section className="card">
          <h2>Income vs expenses · last 6 months</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
              <Tooltip formatter={(v) => formatINR(Number(v))} />
              <Legend />
              <Bar dataKey="Income" fill="#16a34a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Expenses" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
      {categories.length > 0 && (
        <section className="card">
          <h2>Top expenses</h2>
          <table>
            <tbody>
              {categories.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className="num">{formatINR(c.value)}</td>
                  <td className="num muted">{formatPct(c.value / summary.expenses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
