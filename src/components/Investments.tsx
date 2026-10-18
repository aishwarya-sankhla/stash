import { Gem, PiggyBank, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { fdValue, isoDate, totalsByClass } from '../finance'
import { formatINR, formatPct, newId } from '../format'
import type { SetData } from '../store'
import { ASSET_CLASS_LABELS, type AppData, type AssetClass, type Holding } from '../types'
import { FixedDeposits } from './FixedDeposits'
import { HoldingRow } from './HoldingRow'
import { ASSET_STYLE, PageHeader, Stat, TINTS } from './ui'

const CLASSES = Object.keys(ASSET_CLASS_LABELS) as AssetClass[]
const shortLabel = (c: AssetClass) => ASSET_CLASS_LABELS[c].split(' (')[0]

export function Investments({ data, setData }: { data: AppData; setData: SetData }) {
  const [name, setName] = useState('')
  const [assetClass, setAssetClass] = useState<AssetClass>('equity')
  const [invested, setInvested] = useState('')
  const [currentValue, setCurrentValue] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const inv = Number(invested)
    const cur = currentValue === '' ? inv : Number(currentValue)
    if (!name.trim() || !(inv >= 0) || !(cur >= 0)) return
    setData((d) => ({
      ...d,
      holdings: [...d.holdings, { id: newId(), name: name.trim(), assetClass, invested: inv, currentValue: cur, valueUpdated: isoDate() }],
    }))
    setName('')
    setInvested('')
    setCurrentValue('')
  }

  const updateHolding = (updated: Holding) => setData((d) => ({ ...d, holdings: d.holdings.map((h) => (h.id === updated.id ? updated : h)) }))
  const remove = (id: string) => setData((d) => ({ ...d, holdings: d.holdings.filter((h) => h.id !== id) }))

  const today = isoDate()
  const totalInvested = data.holdings.reduce((s, h) => s + h.invested, 0) + data.fds.reduce((s, f) => s + f.principal, 0)
  const totalValue = data.holdings.reduce((s, h) => s + h.currentValue, 0) + data.fds.reduce((s, f) => s + fdValue(f, today), 0)
  const gain = totalValue - totalInvested
  const byClass = totalsByClass(data, today)
  const mix = CLASSES.filter((c) => byClass[c] > 0).map((c) => ({ cls: c, name: shortLabel(c), value: byClass[c] }))

  return (
    <div className="stack">
      <PageHeader eyebrow="Portfolio" title="Investments" />
      <div className="stats">
        <Stat label="Current value" value={formatINR(totalValue)} icon={Gem} tint="lilac" />
        <Stat label="Invested" value={formatINR(totalInvested)} icon={PiggyBank} tint="sky" />
        <Stat label="Total return" value={formatINR(gain)} icon={gain >= 0 ? TrendingUp : TrendingDown} tint={gain >= 0 ? 'mint' : 'rose'} tone={gain >= 0 ? 'pos' : 'neg'}>
          {totalInvested > 0 && <div className="stat-foot">{formatPct(gain / totalInvested)} all time</div>}
        </Stat>
      </div>
      <form className="card composer" onSubmit={submit}>
        <input className="grow" placeholder="Holding name, e.g. Nifty 50 index fund" value={name} onChange={(e) => setName(e.target.value)} required />
        <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)} aria-label="Asset class">
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {ASSET_CLASS_LABELS[c]}
            </option>
          ))}
        </select>
        <input type="number" min="0" step="any" placeholder="Invested ₹" value={invested} onChange={(e) => setInvested(e.target.value)} required />
        <input type="number" min="0" step="any" placeholder="Worth now ₹" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} />
        <button className="primary" type="submit">
          <Plus size={16} strokeWidth={2.6} /> Add
        </button>
      </form>
      <div className="grid-wide">
        <section className="card">
          <div className="card-head">
            <h2>Holdings</h2>
            <span className="muted small">Click a value to update it · ⌄ to add money or set up a SIP</span>
          </div>
          {data.holdings.length === 0 ? (
            <p className="empty">No holdings yet. Cash holdings count as your emergency fund.</p>
          ) : (
            <ul className="tx-list">
              {data.holdings.map((h) => (
                <HoldingRow key={h.id} holding={h} today={today} onChange={updateHolding} onRemove={() => remove(h.id)} />
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Asset mix</h2>
          </div>
          {mix.length === 0 ? (
            <p className="empty">Add holdings to see your mix.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={mix} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} cornerRadius={5} stroke="none">
                    {mix.map((m) => (
                      <Cell key={m.cls} fill={TINTS[ASSET_STYLE[m.cls][1]].chart} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={{ borderRadius: 12, border: '1px solid #E9E4DA' }} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="legend-list">
                {mix.map((m) => (
                  <li key={m.cls}>
                    <span className="legend-dot" style={{ background: TINTS[ASSET_STYLE[m.cls][1]].chart }} />
                    <span className="legend-name">{m.name}</span>
                    <span className="legend-amt">{formatINR(m.value)}</span>
                    <span className="legend-pct">{formatPct(m.value / totalValue)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      <FixedDeposits data={data} setData={setData} />
    </div>
  )
}
