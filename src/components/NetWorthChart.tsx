import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompactINR, formatINR, formatMonth, formatPct } from '../format'
import { ASSET_CLASS_LABELS, type AssetClass, type NetWorthSnapshot } from '../types'
import { ASSET_STYLE, TINTS } from './ui'

// Steadier classes at the bottom, so market swings show up along the top edge.
const STACK: AssetClass[] = ['cash', 'debt', 'realEstate', 'gold', 'other', 'equity']
const shortLabel = (cls: AssetClass) => ASSET_CLASS_LABELS[cls].split(' (')[0]
const tooltipStyle = { borderRadius: 12, border: '1px solid #E9E4DA', boxShadow: '0 8px 24px -12px rgba(23,20,31,.25)', fontFamily: 'inherit' }

/** Month-by-month net worth, stacked by asset class. */
export function NetWorthChart({ history }: { history: NetWorthSnapshot[] }) {
  const classes = STACK.filter((cls) => history.some((s) => s.byClass[cls] > 0))
  const first = history[0]
  const last = history[history.length - 1]
  const change = history.length > 1 ? last.total - first.total : 0
  const multiYear = history.length > 0 && first.month.slice(0, 4) !== last.month.slice(0, 4)
  const points = history.map((s) => ({
    label: multiYear ? formatMonth(s.month).replace(' 20', ' ’') : formatMonth(s.month).split(' ')[0],
    month: formatMonth(s.month),
    ...Object.fromEntries(classes.map((cls) => [shortLabel(cls), s.byClass[cls]])),
  }))

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Net worth over time</h2>
          {history.length > 1 && (
            <span className="muted small">
              <span className={change >= 0 ? 'pos' : 'neg'}>
                {change >= 0 ? '+' : '−'}
                {formatINR(Math.abs(change))}
                {first.total > 0 && ` (${change >= 0 ? '+' : '−'}${formatPct(Math.abs(change) / first.total)})`}
              </span>{' '}
              since {formatMonth(first.month)}
            </span>
          )}
        </div>
        {history.length > 1 && (
          <span className="legend-inline">
            {classes.map((cls) => (
              <span key={cls}>
                <i style={{ background: TINTS[ASSET_STYLE[cls][1]].chart }} /> {shortLabel(cls)}
              </span>
            ))}
          </span>
        )}
      </div>
      {history.length < 2 ? (
        <p className="empty">
          {history.length === 0
            ? 'Add your investments and Stash will record your net worth every month.'
            : `Stash saves a snapshot of your net worth every month. This is the first one (${formatINR(last.total)}); your trend line starts next month.`}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#EFEAE1" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#8C8698' }} />
            <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#8C8698' }} tickFormatter={(v) => formatCompactINR(Number(v))} width={56} />
            <Tooltip
              formatter={(v) => formatINR(Number(v))}
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as { month: string } | undefined
                const total = payload?.reduce((s, item) => s + Number(item.value), 0) ?? 0
                return p ? `${p.month} · ${formatINR(total)}` : ''
              }}
              itemSorter={(item) => -classes.findIndex((cls) => shortLabel(cls) === item.name)}
              contentStyle={tooltipStyle}
              itemStyle={{ color: '#3B3646', padding: 0 }}
            />
            {classes.map((cls) => {
              const color = TINTS[ASSET_STYLE[cls][1]].chart
              return <Area key={cls} type="monotone" dataKey={shortLabel(cls)} stackId="nw" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.55} />
            })}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </section>
  )
}
