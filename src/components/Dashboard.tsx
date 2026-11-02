import { ArrowDownRight, ArrowUpRight, Flame, Gem } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { isoDate, lastMonths, previousMonth, savingStreak, savingsRate, summarizeMonth, totalsByClass } from '../finance'
import { formatINR, formatMonth, formatPct } from '../format'
import type { AppData } from '../types'
import { NetWorthChart } from './NetWorthChart'
import { CHART_COLORS, MonthPicker, Ring, Stat } from './ui'

function mood(rate: number | null) {
  if (rate === null) return 'Log some income to get things going.'
  if (rate < 0) return 'Spending outran income. Let’s rein it in.'
  if (rate < 0.2) return 'A solid start. Every rupee counts.'
  if (rate < 0.3) return 'Nicely done. You’re saving like a pro.'
  return 'On fire. Your future self says thanks.'
}

/** "▲ ₹1,200 (+17%)" style change in spending; spending more is shown as bad, less as good. */
function SpendChange({ now, before, label }: { now: number; before: number; label: string }) {
  if (before === 0) return <span className="neg">new vs {label}</span>
  if (now === before) return <span>same as {label}</span>
  const diff = now - before
  return (
    <span className={diff > 0 ? 'neg' : 'pos'}>
      {diff > 0 ? '▲' : '▼'} {formatINR(Math.abs(diff))} ({diff > 0 ? '+' : '−'}
      {formatPct(Math.abs(diff) / before)}) vs {label}
    </span>
  )
}

const tooltipStyle = { borderRadius: 12, border: '1px solid #E9E4DA', boxShadow: '0 8px 24px -12px rgba(23,20,31,.25)', fontFamily: 'inherit' }

export function Dashboard({ data, currentMonth }: { data: AppData; currentMonth: string }) {
  const [month, setMonth] = useState(currentMonth)
  const [categoryView, setCategoryView] = useState<'share' | 'compare'>('share')
  const summary = summarizeMonth(data.transactions, month)
  const prev = summarizeMonth(data.transactions, previousMonth(month))
  const prevLabel = formatMonth(prev.month).split(' ')[0]
  const monthLabel = formatMonth(month).split(' ')[0] + (month === currentMonth ? ' so far' : '')
  const rate = savingsRate(summary.income, summary.expenses)
  const saved = summary.income - summary.expenses
  const netWorth = Object.values(totalsByClass(data, isoDate())).reduce((s, v) => s + v, 0)
  const streak = savingStreak(data.transactions, currentMonth)
  const lastSnapshot = data.netWorth.filter((s) => s.month < currentMonth).at(-1)
  const netWorthChange = lastSnapshot ? netWorth - lastSnapshot.total : 0

  const categories = Object.entries(summary.byCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  // Both months' categories, biggest spend this month first, so categories you stopped spending on still show.
  const comparison = [...new Set([...categories.map((c) => c.name), ...Object.keys(prev.byCategory)])]
    .map((name) => ({ name, [monthLabel]: summary.byCategory[name] ?? 0, [prevLabel]: prev.byCategory[name] ?? 0 }))
    .sort((a, b) => (b[monthLabel] as number) - (a[monthLabel] as number) || (b[prevLabel] as number) - (a[prevLabel] as number))
    .slice(0, 8)
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
          <div className="stat-foot">
            {lastSnapshot ? (
              <>
                <span className={netWorthChange >= 0 ? 'pos' : 'neg'}>
                  {netWorthChange >= 0 ? '▲' : '▼'} {formatINR(Math.abs(netWorthChange))}
                </span>{' '}
                since {formatMonth(lastSnapshot.month).split(' ')[0]}
              </>
            ) : (
              `across ${data.holdings.length + data.fds.length} holdings`
            )}
          </div>
        </Stat>
      </div>

      <NetWorthChart history={data.netWorth} />

      <div className="grid2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Where it went</h2>
              <span className="muted small">
                {formatINR(summary.expenses)} {month === currentMonth ? 'so far' : 'total'}
                {prev.expenses > 0 && (
                  <>
                    {' · '}
                    <SpendChange now={summary.expenses} before={prev.expenses} label={prevLabel} />
                  </>
                )}
              </span>
            </div>
            <div className="segmented small">
              <button type="button" className={categoryView === 'share' ? 'active' : ''} aria-pressed={categoryView === 'share'} onClick={() => setCategoryView('share')}>
                Breakdown
              </button>
              <button type="button" className={categoryView === 'compare' ? 'active' : ''} aria-pressed={categoryView === 'compare'} onClick={() => setCategoryView('compare')}>
                vs {prevLabel}
              </button>
            </div>
          </div>
          {categoryView === 'compare' ? (
            comparison.length === 0 ? (
              <p className="empty">No spending in {prevLabel} or {formatMonth(month).split(' ')[0]} to compare.</p>
            ) : (
              <>
                <span className="legend-inline">
                  <i style={{ background: '#D9D2FF' }} /> {prevLabel} <i style={{ background: '#7B66F0' }} /> {monthLabel}
                </span>
                <ResponsiveContainer width="100%" height={comparison.length * 46 + 24}>
                  <BarChart data={comparison} layout="vertical" barGap={3} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke="#EFEAE1" />
                    <XAxis type="number" axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#8C8698' }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={104} fontSize={12} tick={{ fill: '#4A4458' }} />
                    <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: '#F5F2EC' }} />
                    <Bar dataKey={prevLabel} fill="#D9D2FF" radius={[0, 6, 6, 0]} maxBarSize={14} />
                    <Bar dataKey={monthLabel} fill="#7B66F0" radius={[0, 6, 6, 0]} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </>
            )
          ) : categories.length === 0 ? (
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
                    <span className="legend-name">
                      {c.name}
                      {prev.expenses > 0 && (
                        <span className="chip-sub">
                          <SpendChange now={c.value} before={prev.byCategory[c.name] ?? 0} label={prevLabel} />
                        </span>
                      )}
                    </span>
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
