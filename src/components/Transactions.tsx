import { useState, type FormEvent } from 'react'
import { monthKey } from '../finance'
import { formatINR, newId } from '../format'
import type { SetData } from '../store'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type AppData, type TxType } from '../types'
import { MonthPicker } from './ui'

const today = () => {
  const d = new Date() // local date, not UTC (toISOString would be off by a day near midnight in IST)
  return `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`
}

export function Transactions({ data, setData }: { data: AppData; setData: SetData }) {
  const [type, setType] = useState<TxType>('expense')
  const [date, setDate] = useState(today)
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [month, setMonth] = useState(monthKey(new Date()))
  const [query, setQuery] = useState('')

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
  }

  const remove = (id: string) => setData((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }))

  const q = query.trim().toLowerCase()
  const rows = data.transactions
    .filter((t) => monthKey(t.date) === month)
    .filter((t) => !q || t.category.toLowerCase().includes(q) || t.note.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="stack">
      <h1>Transactions</h1>
      <form className="card form-row" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={type === 'expense' ? 'active neg' : ''} onClick={() => changeType('expense')}>
            Expense
          </button>
          <button type="button" className={type === 'income' ? 'active pos' : ''} onClick={() => changeType('income')}>
            Income
          </button>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input type="number" min="1" step="any" placeholder="Amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="primary" type="submit">
          Add
        </button>
      </form>
      <section className="card">
        <div className="row between">
          <MonthPicker value={month} onChange={setMonth} />
          <input placeholder="Search category or note" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {rows.length === 0 ? (
          <p className="muted">No transactions for this month.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Note</th>
                <th className="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{t.category}</td>
                  <td className="muted">{t.note}</td>
                  <td className={`num ${t.type === 'income' ? 'pos' : 'neg'}`}>
                    {t.type === 'income' ? '+' : '−'}
                    {formatINR(t.amount)}
                  </td>
                  <td className="num">
                    <button className="icon" title="Delete" onClick={() => remove(t.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
