import { ArrowDownRight, ArrowUpRight, Flame, Gem } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { lastMonths, savingStreak, savingsRate, summarizeMonth } from '../finance'
import { formatINR, formatMonth, formatPct } from '../format'
import type { AppData } from '../types'
import { CHART_COLORS, MonthPicker, Ring, Stat } from './ui'

function mood(rate: number | null) {
  if (rate === null) return 'Log some income to get things going.'
  if (rate < 0) return 'Spending outran income. Let’s rein it in.'
  if (rate < 0.2) return 'A solid start. Every rupee counts.'
  if (rate < 0.3) return 'Nicely done. You’re saving like a pro.'
  return 'On fire. Your future self says thanks.'
}

const tooltipStyle = { borderRadius: 12, border: '1px solid #E9E4DA', boxShadow: '0 8px 24px -12px rgba(23,20,31,.25)', fontFamily: 'inherit' }

export function Dashboard({ data, currentMonth }: { data: AppData; currentMonth: string }) {
  const [month, setMonth] = useState(currentMonth)
  const summary = summarizeMonth(data.transactions, month)
  const rate = savingsRate(summary.income, summary.expenses)
  const saved = summary.income - summary.expenses
  const netWorth = data.holdings.reduce((s, h) => s + h.currentValue, 0)
  const streak = savingStreak(data.transactions, currentMonth)

  const categories = Object.entries(summary.byCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  const trend = lastMonths(month, 6).map((m) => {
    const s = summarizeMonth(data.transactions, m)
    return { month: formatMonth(m).split(' ')[0], Income: s.income, Expenses: s.expenses }
  })

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>{formatMonth(month)}</h1>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </header>

      <div className="bento">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-eyebrow">You stashed</div>
            <div className="hero-amount">{formatINR(saved)}</div>
            <p className="hero-mood">{mood(rate)}</p>
            {streak > 0 && (
              <span className="streak" title="Consecutive completed months saving 20% or more of income">
                <Flame size={15} strokeWidth={2.4} /> {streak}-month saving streak
              </span>
            )}
          </div>
          <Ring fraction={rate ?? 0}>
            <span className="ring-pct">{rate === null ? '—' : formatPct(rate)}</span>
            <span className="ring-cap">saved</span>
          </Ring>
        </section>
        <Stat label="Money in" value={formatINR(summary.income)} icon={ArrowDownRight} tint="mint" />
        <Stat label="Money out" value={formatINR(summary.expenses)} icon={ArrowUpRight} tint="peach" />
        <Stat label="Net worth" value={formatINR(netWorth)} icon={Gem} tint="lilac">
          <div className="stat-foot">across {data.holdings.length} holdings</div>
        </Stat>
      </div>

      <div className="grid2">
        <section className="card">
          <div className="card-head">
            <h2>Where it went</h2>
            <span className="muted small">{formatINR(summary.expenses)} total</span>
          </div>
          {categories.length === 0 ? (
            <p className="empty">Nothing spent yet this month.</p>
          ) : (
            <div className="donut-layout">
              <div className="donut">
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={categories} dataKey="value" nameKey="name" innerRadius={66} outerRadius={98} paddingAngle={2} cornerRadius={5} stroke="none">
                      {categories.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="legend-list">
                {categories.slice(0, 7).map((c, i) => (
                  <li key={c.name}>
                    <span className="legend-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="legend-name">{c.name}</span>
                    <span className="legend-amt">{formatINR(c.value)}</span>
                    <span className="legend-pct">{formatPct(c.value / summary.expenses)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Six-month rhythm</h2>
            <span className="legend-inline">
              <i style={{ background: 'var(--ink)' }} /> In <i style={{ background: '#A797FF' }} /> Out
            </span>
          </div>
          {trend.every((t) => !t.Income && !t.Expenses) ? (
            <p className="empty">Your last six months will show up here.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={trend} barGap={4} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#EFEAE1" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#8C8698' }} />
                <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#8C8698' }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: '#F5F2EC' }} />
                <Bar dataKey="Income" fill="#17141F" radius={[6, 6, 6, 6]} maxBarSize={18} />
                <Bar dataKey="Expenses" fill="#A797FF" radius={[6, 6, 6, 6]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>
    </div>
  )
}
