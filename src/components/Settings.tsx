import { useRef, useState } from 'react'
import { version } from '../../package.json'
import { sampleData } from '../sampleData'
import { desktop, desktopDataPath, moveDataFile, openDataFile, parseData, type SetData } from '../store'
import { DEFAULT_DATA, type AppData, type Profile, type RiskTolerance } from '../types'
import { PhoneImport } from './PhoneImport'
import { PageHeader } from './ui'

export function Settings({ data, setData }: { data: AppData; setData: SetData }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [filePath, setFilePath] = useState(desktopDataPath)
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
      const next = parseData(await file.text())
      await desktop?.backupNow()
      setData(next)
      setMessage(`Imported ${file.name}.`)
    } catch {
      setMessage('That file is not valid finance data JSON.')
    }
  }

  async function moveFile() {
    const path = await moveDataFile(data)
    if (path) {
      setFilePath(path)
      setMessage('Data file moved. New changes save there.')
    }
  }

  async function openFile() {
    try {
      const result = await openDataFile()
      if (!result) return
      setData(result.data)
      setFilePath(result.path)
      setMessage(`Opened ${result.path}.`)
    } catch {
      setMessage("That file doesn't look like Stash data.")
    }
  }

  async function restoreBackup() {
    const file = await desktop!.openBackup()
    if (!file) return
    let next: AppData
    try {
      next = parseData(file.json)
    } catch {
      setMessage(`${file.name} isn't a Stash backup.`)
      return
    }
    if (!confirm(`Restore ${file.name}? This replaces your current data; a backup of it is saved first.`)) return
    await desktop!.backupNow()
    setData(next)
    setMessage(`Restored ${file.name}.`)
  }

  async function replace(next: AppData, label: string) {
    const hasData = data.transactions.length > 0 || data.holdings.length > 0 || data.fds.length > 0
    if (hasData && !confirm(`${label} will replace all your current data. Continue?`)) return
    await desktop?.backupNow()
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
      {desktop && (
        <section className="card">
          <div className="card-head">
            <h2>Data file</h2>
            <span className="tag ok">Auto-saving</span>
          </div>
          <p className="muted small">Every change is saved to this file on your computer straight away. Back it up or sync it like any other file.</p>
          <code className="file-path">{filePath}</code>
          <div className="row">
            <button onClick={() => desktop!.reveal()}>Show in folder</button>
            <button onClick={moveFile}>Move to…</button>
            <button onClick={openFile}>Open another file…</button>
          </div>
          <h3 className="subhead">Backups</h3>
          <p className="muted small">
            Stash keeps a copy of your data from each of the last 30 days, plus one before any reset, import or restore, in a backups folder next to
            your data file.
          </p>
          <div className="row">
            <button onClick={() => desktop!.revealBackups()}>Show backups</button>
            <button onClick={restoreBackup}>Restore a backup…</button>
          </div>
        </section>
      )}
      <PhoneImport data={data} setData={setData} />
      <section className="card">
        <h2>Your data</h2>
        <p className="muted small">
          {desktop
            ? 'Export a dated backup copy, or import data exported from the browser version.'
            : 'Everything is stored in this browser only. Export a backup regularly, or to move your data to another device.'}
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
      <p className="muted small app-version">Stash v{version}</p>
    </div>
  )
}
