import { useState, type FormEvent } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { totalsByClass } from '../finance'
import { formatINR, formatPct, newId } from '../format'
import type { SetData } from '../store'
import { ASSET_CLASS_LABELS, type AppData, type AssetClass } from '../types'
import { COLORS, Stat } from './ui'

const CLASSES = Object.keys(ASSET_CLASS_LABELS) as AssetClass[]

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
      holdings: [...d.holdings, { id: newId(), name: name.trim(), assetClass, invested: inv, currentValue: cur }],
    }))
    setName('')
    setInvested('')
    setCurrentValue('')
  }

  const updateValue = (id: string, value: number) =>
    setData((d) => ({ ...d, holdings: d.holdings.map((h) => (h.id === id ? { ...h, currentValue: value } : h)) }))
  const remove = (id: string) => setData((d) => ({ ...d, holdings: d.holdings.filter((h) => h.id !== id) }))

  const totalInvested = data.holdings.reduce((s, h) => s + h.invested, 0)
  const totalValue = data.holdings.reduce((s, h) => s + h.currentValue, 0)
  const gain = totalValue - totalInvested
  const byClass = totalsByClass(data.holdings)
  const pie = CLASSES.filter((c) => byClass[c] > 0).map((c) => ({ name: ASSET_CLASS_LABELS[c].split(' (')[0], value: byClass[c] }))

  return (
    <div className="stack">
      <h1>Investments</h1>
      <div className="stats">
        <Stat label="Current value" value={formatINR(totalValue)} />
        <Stat label="Invested" value={formatINR(totalInvested)} />
        <Stat
          label="Gain / loss"
          value={`${formatINR(gain)}${totalInvested > 0 ? ` (${formatPct(gain / totalInvested)})` : ''}`}
          tone={gain >= 0 ? 'pos' : 'neg'}
        />
      </div>
      <form className="card form-row" onSubmit={submit}>
        <input placeholder="Holding name (e.g. Nifty 50 index fund)" value={name} onChange={(e) => setName(e.target.value)} required />
        <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {ASSET_CLASS_LABELS[c]}
            </option>
          ))}
        </select>
        <input type="number" min="0" step="any" placeholder="Invested (₹)" value={invested} onChange={(e) => setInvested(e.target.value)} required />
        <input type="number" min="0" step="any" placeholder="Current value (₹)" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} />
        <button className="primary" type="submit">
          Add
        </button>
      </form>
      <div className="grid2">
        <section className="card">
          <h2>Holdings</h2>
          {data.holdings.length === 0 ? (
            <p className="muted">No holdings yet. Cash holdings count towards your emergency fund.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Invested</th>
                  <th className="num">Current value</th>
                  <th className="num">Return</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h) => {
                  const ret = h.invested > 0 ? (h.currentValue - h.invested) / h.invested : 0
                  return (
                    <tr key={h.id}>
                      <td>
                        {h.name}
                        <div className="muted small">{ASSET_CLASS_LABELS[h.assetClass].split(' (')[0]}</div>
                      </td>
                      <td className="num">{formatINR(h.invested)}</td>
                      <td className="num">
                        <input
                          className="inline-num"
                          type="number"
                          min="0"
                          value={h.currentValue}
                          onChange={(e) => updateValue(h.id, Number(e.target.value) || 0)}
                          title="Update current value"
                        />
                      </td>
                      <td className={`num ${ret >= 0 ? 'pos' : 'neg'}`}>{formatPct(ret)}</td>
                      <td className="num">
                        <button className="icon" title="Delete" onClick={() => remove(h.id)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2>Asset mix</h2>
          {pie.length === 0 ? (
            <p className="muted">Add holdings to see your asset mix.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {pie.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `${formatINR(Number(v))} (${formatPct(Number(v) / totalValue)})`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>
    </div>
  )
}
