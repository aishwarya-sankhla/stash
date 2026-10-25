import { Pencil, Plus, Vault, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { daysBetween, fdValue, isoDate } from '../finance'
import { formatDate, formatINR, newId } from '../format'
import type { SetData } from '../store'
import type { AppData, FixedDeposit } from '../types'
import { IconTile } from './ui'

const oneYearLater = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return isoDate(new Date(y + 1, m - 1, d)) // 29 Feb rolls over to 1 Mar
}

function timeLeft(daysLeft: number) {
  if (daysLeft < 0) return { text: 'Matured', tone: 'ok' }
  if (daysLeft === 0) return { text: 'Matures today', tone: 'near' }
  if (daysLeft <= 30) return { text: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`, tone: 'near' }
  const months = Math.round(daysLeft / 30.4)
  return { text: months < 24 ? `${months} months left` : `${(daysLeft / 365).toFixed(1)} years left`, tone: 'neutral' }
}

export function FixedDeposits({ data, setData }: { data: AppData; setData: SetData }) {
  const today = isoDate()
  const [bank, setBank] = useState('')
  const [principal, setPrincipal] = useState('')
  const [rate, setRate] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [maturityDate, setMaturityDate] = useState(() => oneYearLater(today))
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const form = useRef<HTMLFormElement>(null)

  function reset() {
    setBank('')
    setPrincipal('')
    setRate('')
    setStartDate(today)
    setMaturityDate(oneYearLater(today))
    setError('')
    setEditing(null)
  }

  /** Loads an FD into the form above; submitting then saves changes instead of adding. */
  function edit(fd: FixedDeposit) {
    setBank(fd.bank)
    setPrincipal(String(fd.principal))
    setRate(String(fd.rate))
    setStartDate(fd.startDate)
    setMaturityDate(fd.maturityDate)
    setError('')
    setEditing(fd.id)
    form.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const p = Number(principal)
    const r = Number(rate)
    if (maturityDate <= startDate) return setError('Maturity date must be after the start date.')
    if (!(p > 0) || !(r >= 0 && r <= 50)) return setError('Enter an amount and an interest rate between 0 and 50%.')
    const fd = { id: editing ?? newId(), bank: bank.trim(), principal: p, rate: r, startDate, maturityDate }
    setData((d) => ({ ...d, fds: editing ? d.fds.map((f) => (f.id === editing ? fd : f)) : [...d.fds, fd] }))
    reset()
  }

  const remove = (id: string) => {
    if (id === editing) reset()
    setData((d) => ({ ...d, fds: d.fds.filter((f) => f.id !== id) }))
  }

  const fds = [...data.fds].sort((a, b) => a.maturityDate.localeCompare(b.maturityDate))
  const totalPrincipal = fds.reduce((s, f) => s + f.principal, 0)
  const totalAtMaturity = fds.reduce((s, f) => s + fdValue(f, f.maturityDate), 0)

  return (
    <section className="card">
      <div className="card-head">
        <h2>Fixed deposits</h2>
        {fds.length > 0 && (
          <span className="muted small">
            {formatINR(totalPrincipal)} deposited · {formatINR(totalAtMaturity)} at maturity
          </span>
        )}
      </div>
      <form ref={form} className={`fd-form ${editing ? 'editing' : ''}`} onSubmit={submit}>
        <label className="field grow">
          <span>Bank</span>
          <input placeholder="e.g. SBI" value={bank} onChange={(e) => setBank(e.target.value)} required />
        </label>
        <label className="field">
          <span>Amount ₹</span>
          <input type="number" min="1" step="any" placeholder="100000" value={principal} onChange={(e) => setPrincipal(e.target.value)} required />
        </label>
        <label className="field">
          <span>Interest % p.a.</span>
          <input className="rate-input" type="number" min="0" max="50" step="0.01" placeholder="7.1" value={rate} onChange={(e) => setRate(e.target.value)} required />
        </label>
        <label className="field">
          <span>Start date</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </label>
        <label className="field">
          <span>Maturity date</span>
          <input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} required />
        </label>
        {editing ? (
          <>
            <button className="primary" type="submit">
              Save changes
            </button>
            <button type="button" onClick={reset}>
              Cancel
            </button>
          </>
        ) : (
          <button className="primary" type="submit">
            <Plus size={16} strokeWidth={2.6} /> Add FD
          </button>
        )}
      </form>
      {error && <p className="form-error">{error}</p>}
      {fds.length === 0 ? (
        <p className="empty">No FDs yet. Add one above to track its interest and maturity.</p>
      ) : (
        <ul className="tx-list">
          {fds.map((fd) => {
            const left = timeLeft(daysBetween(today, fd.maturityDate))
            return (
              <li key={fd.id}>
                <span className="chip">
                  <IconTile icon={Vault} tint="sky" size="sm" />
                  <span>
                    {fd.bank}
                    <span className="chip-sub">
                      {formatINR(fd.principal)} at {fd.rate}% · {formatDate(fd.startDate)} → {formatDate(fd.maturityDate)}
                    </span>
                  </span>
                </span>
                <span className={`tag ${left.tone}`}>{left.text}</span>
                <span className="fd-value">
                  {formatINR(fdValue(fd, today))}
                  <span className="chip-sub">{formatINR(fdValue(fd, fd.maturityDate))} at maturity</span>
                </span>
                <span className="row-actions">
                  <button className="icon edit" title="Edit" onClick={() => edit(fd)}>
                    <Pencil size={14} />
                  </button>
                  <button className="icon" title="Delete" onClick={() => remove(fd.id)}>
                    <X size={15} />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted small">Values assume a cumulative FD: interest reinvested and compounded quarterly. FDs count as debt in your investment mix.</p>
    </section>
  )
}
