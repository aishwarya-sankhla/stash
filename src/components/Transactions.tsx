import { Plus, Search, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { monthKey } from '../finance'
import { formatINR, newId } from '../format'
import type { SetData } from '../store'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type AppData, type TxType } from '../types'
import { CategoryChip, MonthPicker, PageHeader, celebrate } from './ui'

const EXPENSE_QUIPS = ['Logged. No judgement.', 'Tracked and filed.', 'Noted. Onwards.', 'Into the books it goes.']
const INCOME_QUIPS = ['Cha-ching.', 'Money in. Nice.', 'Your stash just grew.', 'Ka-ching.']
const pick = (xs: string[]) => xs[Math.floor(Math.random() * xs.length)]

const today = () => {
  const d = new Date() // local date, not UTC (toISOString would be off by a day near midnight in IST)
  return `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`
}

const formatDay = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

export function Transactions({ data, setData }: { data: AppData; setData: SetData }) {
  const [type, setType] = useState<TxType>('expense')
  const [date, setDate] = useState(today)
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [month, setMonth] = useState(monthKey(new Date()))
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)

  const categories = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES

  function changeType(t: TxType) {
    setType(t)
    setCategory((t === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES)[0])
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    if (!(value > 0)) return
    setData((d) => ({
      ...d,
      transactions: [...d.transactions, { id: newId(), date, type, category, amount: value, note: note.trim() }],
    }))
    setAmount('')
    setNote('')
    if (type === 'income') celebrate()
    const id = Date.now()
    setToast({ id, text: pick(type === 'income' ? INCOME_QUIPS : EXPENSE_QUIPS) })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2200)
  }

  const remove = (id: string) => setData((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }))

  const q = query.trim().toLowerCase()
  const rows = data.transactions
    .filter((t) => monthKey(t.date) === month)
    .filter((t) => !q || t.category.toLowerCase().includes(q) || t.note.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="stack">
      <PageHeader eyebrow="Money in & out" title="Transactions" />
      {toast && (
        <div key={toast.id} className="toast" role="status">
          {toast.text}
        </div>
      )}
      <form className="card composer" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={type === 'expense' ? 'active' : ''} onClick={() => changeType('expense')}>
            Expense
          </button>
          <button type="button" className={type === 'income' ? 'active' : ''} onClick={() => changeType('income')}>
            Income
          </button>
        </div>
        <div className="amount-field">
          <span>₹</span>
          <input type="number" min="1" step="any" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} required aria-label="Amount" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Date" />
        <input className="grow" placeholder="What was it for?" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
        <button className="primary" type="submit">
          <Plus size={16} strokeWidth={2.6} /> Add
        </button>
      </form>
      <section className="card">
        <div className="card-head">
          <MonthPicker value={month} onChange={setMonth} />
          <label className="search">
            <Search size={15} />
            <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        {rows.length === 0 ? (
          <p className="empty">Quiet month. No transactions yet.</p>
        ) : (
          <ul className="tx-list">
            {rows.map((t) => (
              <li key={t.id}>
                <CategoryChip category={t.category} sub={t.note || undefined} />
                <span className="tx-date">{formatDay(t.date)}</span>
                <span className={`tx-amt ${t.type === 'income' ? 'pos' : ''}`}>
                  {t.type === 'income' ? '+' : '−'}
                  {formatINR(t.amount)}
                </span>
                <button className="icon" title="Delete" onClick={() => remove(t.id)}>
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
