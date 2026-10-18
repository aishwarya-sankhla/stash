import { ChevronDown, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { addMoney, daysBetween, nextMonth, sipCoveredMonth } from '../finance'
import { formatDate, formatINR, formatPct } from '../format'
import { ASSET_CLASS_LABELS, type Holding } from '../types'
import { ASSET_STYLE, IconTile, MoneyInput } from './ui'

const STALE_DAYS = 60
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

function updatedLabel(h: Holding, today: string) {
  if (!h.valueUpdated) return { text: 'Value not updated yet', stale: true }
  const days = daysBetween(h.valueUpdated, today)
  const text =
    days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : days < 60 ? 'a month ago' : `${Math.floor(days / 30.4)} months ago`
  return { text: `Updated ${text}`, stale: days > STALE_DAYS }
}

export function HoldingRow({ holding: h, today, onChange, onRemove }: { holding: Holding; today: string; onChange: (h: Holding) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const [topUp, setTopUp] = useState('')
  const [sipAmount, setSipAmount] = useState(h.sip ? String(h.sip.amount) : '')
  const [sipDay, setSipDay] = useState(h.sip?.day ?? 5)

  const ret = h.invested > 0 ? (h.currentValue - h.invested) / h.invested : 0
  const [icon, tint] = ASSET_STYLE[h.assetClass]
  const updated = updatedLabel(h, today)

  function addTopUp(e: FormEvent) {
    e.preventDefault()
    const amount = Number(topUp)
    if (!(amount > 0)) return
    onChange(addMoney(h, amount))
    setTopUp('')
  }

  function saveSip(e: FormEvent) {
    e.preventDefault()
    const amount = Number(sipAmount)
    if (!(amount > 0)) return
    // An existing SIP keeps its progress so a changed day never re-adds this month's instalment.
    onChange({ ...h, sip: { amount, day: sipDay, lastApplied: h.sip?.lastApplied ?? sipCoveredMonth(today, sipDay) } })
  }

  function stopSip() {
    const { sip: _stopped, ...rest } = h
    onChange(rest)
    setSipAmount('')
  }

  const nextInstalment = h.sip ? `${nextMonth(h.sip.lastApplied)}-${String(h.sip.day).padStart(2, '0')}` : null

  return (
    <li className="holding-row">
      <span className="chip">
        <IconTile icon={icon} tint={tint} size="sm" />
        <span>
          {h.name}
          <span className="chip-sub">
            {ASSET_CLASS_LABELS[h.assetClass].split(' (')[0]} · {formatINR(h.invested)} invested
            {h.sip && ` · SIP ${formatINR(h.sip.amount)}/mo`}
          </span>
        </span>
      </span>
      <span className={`tag ${ret >= 0 ? 'ok' : 'over'}`}>
        {ret >= 0 ? '+' : ''}
        {formatPct(ret)}
      </span>
      <span className="fd-value">
        <MoneyInput value={h.currentValue} onCommit={(n) => onChange({ ...h, currentValue: n, valueUpdated: today })} label={`${h.name} current value`} />
        <span className={`chip-sub ${updated.stale ? 'stale' : ''}`}>{updated.text}</span>
      </span>
      <button className={`icon manage ${open ? 'open' : ''}`} title="Add money or set up a SIP" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronDown size={16} />
      </button>
      <button className="icon" title="Delete" onClick={onRemove}>
        <X size={15} />
      </button>
      {open && (
        <div className="holding-panel">
          <form className="panel-group" onSubmit={addTopUp}>
            <span className="panel-label">Add money</span>
            <input type="number" min="1" step="any" placeholder="Amount ₹" value={topUp} onChange={(e) => setTopUp(e.target.value)} aria-label={`Add money to ${h.name}`} />
            <button type="submit">Add</button>
          </form>
          <form className="panel-group" onSubmit={saveSip}>
            <span className="panel-label">Monthly SIP</span>
            <input type="number" min="1" step="any" placeholder="Amount ₹" value={sipAmount} onChange={(e) => setSipAmount(e.target.value)} aria-label={`${h.name} SIP amount`} />
            <select value={sipDay} onChange={(e) => setSipDay(Number(e.target.value))} aria-label={`${h.name} SIP day`}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  on day {d}
                </option>
              ))}
            </select>
            <button className="primary" type="submit">
              {h.sip ? 'Update SIP' : 'Start SIP'}
            </button>
            {h.sip && (
              <button type="button" onClick={stopSip}>
                Stop
              </button>
            )}
          </form>
          <p className="muted small panel-note">
            {nextInstalment
              ? `Next instalment ${formatDate(nextInstalment)}. Each instalment is added to invested and current value automatically.`
              : 'Money you add counts at face value. Update the current value from your fund app every month or two to capture growth.'}
          </p>
        </div>
      )}
    </li>
  )
}
