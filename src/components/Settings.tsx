import { useRef, useState } from 'react'
import { sampleData } from '../sampleData'
import { parseData, type SetData } from '../store'
import { DEFAULT_DATA, type AppData, type Profile, type RiskTolerance } from '../types'
import { PageHeader } from './ui'

export function Settings({ data, setData }: { data: AppData; setData: SetData }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const p = data.profile
  const update = (patch: Partial<Profile>) => setData((d) => ({ ...d, profile: { ...d.profile, ...patch, confirmed: true } }))

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `stash-data-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importJson(file: File) {
    try {
      setData(parseData(await file.text()))
      setMessage(`Imported ${file.name}.`)
    } catch {
      setMessage('That file is not valid finance data JSON.')
    }
  }

  function replace(next: AppData, label: string) {
    const hasData = data.transactions.length > 0 || data.holdings.length > 0
    if (hasData && !confirm(`${label} will replace all your current data. Continue?`)) return
    setData(next)
    setMessage(`${label} done.`)
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Preferences" title="Settings" />
      <section className="card">
        <div className="card-head">
          <h2>About you</h2>
          {!p.confirmed && (
            <button className="primary" onClick={() => update({})}>
              Looks right
            </button>
          )}
        </div>
        <p className="muted small">The advisor uses this to tailor recommendations.</p>
        <div className="form-grid">
          <label>
            Age
            <input type="number" min="18" max="100" value={p.age} onChange={(e) => update({ age: Number(e.target.value) || 0 })} />
          </label>
          <label>
            Risk tolerance
            <select value={p.riskTolerance} onChange={(e) => update({ riskTolerance: e.target.value as RiskTolerance })}>
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </label>
          <label>
            Financial dependents
            <input type="number" min="0" value={p.dependents} onChange={(e) => update({ dependents: Number(e.target.value) || 0 })} />
          </label>
          <label>
            High-interest debt outstanding (₹)
            <input
              type="number"
              min="0"
              value={p.highInterestDebt}
              onChange={(e) => update({ highInterestDebt: Number(e.target.value) || 0 })}
            />
            <span className="muted small">Credit cards, personal loans. Exclude home loans.</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={p.hasHealthInsurance} onChange={(e) => update({ hasHealthInsurance: e.target.checked })} />
            I have health insurance
          </label>
          <label className="check">
            <input type="checkbox" checked={p.hasTermInsurance} onChange={(e) => update({ hasTermInsurance: e.target.checked })} />
            I have term life insurance
          </label>
        </div>
      </section>
      <section className="card">
        <h2>Your data</h2>
        <p className="muted small">
          Everything is stored in this browser only. Export a backup regularly, or to move your data to another device.
        </p>
        <div className="row">
          <button onClick={exportJson}>Export JSON</button>
          <button onClick={() => fileInput.current?.click()}>Import JSON</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importJson(f)
              e.target.value = ''
            }}
          />
          <button onClick={() => replace(sampleData(), 'Loading sample data')}>Load sample data</button>
          <button className="danger" onClick={() => replace(DEFAULT_DATA, 'Reset')}>
            Reset all data
          </button>
        </div>
        {message && <p className="muted">{message}</p>}
      </section>
    </div>
  )
}
