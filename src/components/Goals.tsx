import { Flag, Pencil, Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { monthKey, nextMonth } from '../finance'
import { formatINR, formatMonth, formatPct, newId } from '../format'
import { formatTimeLeft, type GoalStatus } from '../goals'
import type { SetData } from '../store'
import type { AppData, Goal } from '../types'
import { IconTile, Progress } from './ui'

const inMonths = (month: string, n: number) => {
  let m = month
  for (let i = 0; i < n; i++) m = nextMonth(m)
  return m
}

function GoalForm({ data, goal, onSave, onCancel }: { data: AppData; goal: Goal | null; onSave: (g: Goal) => void; onCancel: () => void }) {
  const thisMonth = monthKey(new Date())
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? String(goal.target) : '')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? inMonths(thisMonth, 36))
  const [linked, setLinked] = useState<string[]>(goal?.holdingIds ?? [])
  // A holding funds one goal at most, so its value is never counted twice.
  const owner = new Map(data.goals.filter((g) => g.id !== goal?.id).flatMap((g) => g.holdingIds.map((id) => [id, g.name] as const)))

  function save(e: FormEvent) {
    e.preventDefault()
    const amount = Number(target)
    if (!name.trim() || !(amount > 0) || !/^\d{4}-\d{2}$/.test(targetDate)) return
    onSave({ id: goal?.id ?? newId(), name: name.trim(), target: amount, targetDate, holdingIds: linked })
  }

  const toggle = (id: string) => setLinked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  return (
    <form className="goal-form" onSubmit={save} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className="goal-form-fields">
        <label className="field grow">
          <span>Goal</span>
          <input placeholder="e.g. Car down payment" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Amount needed ₹</span>
          <input type="number" min="1" step="any" placeholder="600000" value={target} onChange={(e) => setTarget(e.target.value)} required />
        </label>
        <label className="field">
          <span>By</span>
          <input type="month" min={thisMonth} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required />
        </label>
      </div>
      <div className="goal-links">
        <span className="panel-label">Funded by</span>
        {data.holdings.length === 0 ? (
          <span className="muted small">Add the funds you're saving in on the Investments tab, then link them here.</span>
        ) : (
          data.holdings.map((h) => {
            const taken = owner.get(h.id)
            return (
              <label key={h.id} className={`goal-link ${taken ? 'taken' : ''}`} title={taken ? `Already funds "${taken}"` : undefined}>
                <input type="checkbox" checked={linked.includes(h.id)} disabled={Boolean(taken)} onChange={() => toggle(h.id)} />
                {h.name}
                <span className="muted">{taken ? ` · in ${taken}` : ` · ${formatINR(h.currentValue)}`}</span>
              </label>
            )
          })
        )}
      </div>
      <div className="row">
        <button className="primary" type="submit">
          {goal ? 'Save goal' : 'Add goal'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/** Dated goals, how far along each is, and what it needs each month. */
export function Goals({ data, setData, statuses }: { data: AppData; setData: SetData; statuses: GoalStatus[] }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  function save(goal: Goal) {
    setData((d) => ({ ...d, goals: d.goals.some((g) => g.id === goal.id) ? d.goals.map((g) => (g.id === goal.id ? goal : g)) : [...d.goals, goal] }))
    setEditing(null)
  }

  function remove(goal: Goal) {
    if (!confirm(`Delete the goal "${goal.name}"? Its holdings stay on the Investments tab.`)) return
    setData((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== goal.id) }))
  }

  const sorted = [...statuses].sort((a, b) => a.goal.targetDate.localeCompare(b.goal.targetDate))

  return (
    <section className="card">
      <div className="card-head">
        <h2>Your goals</h2>
        {editing === null && (
          <button className="primary" onClick={() => setEditing('new')}>
            <Plus size={16} strokeWidth={2.6} /> Add goal
          </button>
        )}
      </div>
      {editing === 'new' && <GoalForm data={data} goal={null} onSave={save} onCancel={() => setEditing(null)} />}
      {sorted.length === 0 && editing === null && (
        <p className="empty">
          Saving for something with a date, like a car, a wedding or a house? Add it as a goal and link the funds you're saving in. Stash works out what it
          needs each month and keeps that money out of your long-term mix.
        </p>
      )}
      <ul className="goal-list">
        {sorted.map((s) =>
          editing === s.goal.id ? (
            <li key={s.goal.id}>
              <GoalForm data={data} goal={s.goal} onSave={save} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={s.goal.id} className="goal">
              <div className="goal-head">
                <IconTile icon={Flag} tint="lime" size="sm" />
                <div className="goal-title">
                  <strong>{s.goal.name}</strong>
                  <span className="muted small">
                    {formatINR(s.goal.target)} by {formatMonth(s.goal.targetDate)} · {formatTimeLeft(s.monthsLeft)}
                    {s.monthsLeft > 0 && ' left'}
                  </span>
                </div>
                <span className={`tag ${s.monthsLeft < 0 ? 'neutral' : s.onTrack ? 'ok' : 'near'}`}>
                  {s.monthsLeft < 0 ? 'Date passed' : s.onTrack ? 'On track' : 'Behind'}
                </span>
                <span className="row-actions">
                  <button className="icon edit" title="Edit goal" onClick={() => setEditing(s.goal.id)}>
                    <Pencil size={14} />
                  </button>
                  <button className="icon" title="Delete goal" onClick={() => remove(s.goal)}>
                    <X size={15} />
                  </button>
                </span>
              </div>
              <Progress fraction={Math.min(1, s.current / s.goal.target)} />
              <div className="goal-facts">
                <span>
                  <b>{formatINR(s.current)}</b> saved ({formatPct(Math.min(1, s.current / s.goal.target))})
                </span>
                {s.monthsLeft >= 0 && (
                  <span>
                    Needs <b>{formatINR(s.needed)}</b>/month · SIPs <b>{formatINR(s.sipTotal)}</b>/month
                  </span>
                )}
                {s.monthsLeft >= 0 && (
                  <span>
                    Suggested mix: about {formatPct(s.suggestedEquity)} equity, the rest in arbitrage or debt funds
                    {s.currentEquity !== null && ` · now ${formatPct(s.currentEquity)} equity`}
                  </span>
                )}
              </div>
              <div className="muted small">
                {s.holdings.length > 0 ? `Funded by ${s.holdings.map((h) => h.name).join(', ')}` : 'No holdings linked yet. Edit the goal to link the funds you are saving in.'}
              </div>
            </li>
          ),
        )}
      </ul>
      {sorted.length > 0 && (
        <p className="muted small">
          Assumes 6.5% a year for goals up to 3 years away, 9% up to 7 years and 11% beyond. Linked holdings count towards their goal only.
        </p>
      )}
    </section>
  )
}
