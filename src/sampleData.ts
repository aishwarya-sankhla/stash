import { lastMonths, monthKey } from './finance'
import { newId } from './format'
import type { AppData, Transaction } from './types'

/** Six months of realistic demo data ending in the current month. */
export function sampleData(today = new Date()): AppData {
  const months = lastMonths(monthKey(today), 6)
  const transactions: Transaction[] = []
  const currentMonth = months[months.length - 1]
  const add = (date: string, type: Transaction['type'], category: string, amount: number, note = '') => {
    // Skip future-dated entries in the current, partial month
    if (monthKey(date) === currentMonth && Number(date.slice(8)) > today.getDate()) return
    transactions.push({ id: newId(), date, type, category, amount, note })
  }

  months.forEach((m, i) => {
    const wobble = (base: number, k: number) => Math.round(base * (0.85 + ((i * 7 + k * 3) % 10) / 33))
    add(`${m}-01`, 'income', 'Salary', 120000, 'Monthly salary')
    if (i % 2 === 0) add(`${m}-15`, 'income', 'Freelance', 15000, 'Side project')
    add(`${m}-02`, 'expense', 'Rent', 32000, 'Apartment')
    add(`${m}-05`, 'expense', 'Groceries', wobble(11000, 1))
    add(`${m}-06`, 'expense', 'Utilities', wobble(4500, 2), 'Electricity, internet, phone')
    add(`${m}-08`, 'expense', 'Transport', wobble(5000, 3), 'Fuel & cabs')
    add(`${m}-10`, 'expense', 'EMI / Loans', 9000, 'Two-wheeler loan')
    add(`${m}-12`, 'expense', 'Dining', wobble(7000, 4))
    add(`${m}-18`, 'expense', 'Shopping', wobble(i === 3 ? 22000 : 8000, 5))
    add(`${m}-20`, 'expense', 'Entertainment', wobble(3000, 6), 'OTT & movies')
    if (i === 2) add(`${m}-22`, 'expense', 'Travel', 28000, 'Goa trip')
    if (i === 4) add(`${m}-24`, 'expense', 'Health', 6500, 'Doctor & medicines')
  })

  return {
    transactions,
    budgets: { Groceries: 12000, Dining: 6000, Shopping: 8000, Entertainment: 3000, Transport: 5500 },
    holdings: [
      { id: newId(), name: 'Nifty 50 index fund', assetClass: 'equity', invested: 420000, currentValue: 545000 },
      { id: newId(), name: 'Flexi-cap mutual fund', assetClass: 'equity', invested: 250000, currentValue: 301000 },
      { id: newId(), name: 'Direct stocks', assetClass: 'equity', invested: 150000, currentValue: 162000 },
      { id: newId(), name: 'EPF', assetClass: 'debt', invested: 280000, currentValue: 312000 },
      { id: newId(), name: 'PPF', assetClass: 'debt', invested: 90000, currentValue: 98000 },
      { id: newId(), name: 'Sovereign Gold Bonds', assetClass: 'gold', invested: 60000, currentValue: 84000 },
      { id: newId(), name: 'Savings account + sweep FD', assetClass: 'cash', invested: 480000, currentValue: 480000 },
    ],
    profile: {
      age: 31,
      riskTolerance: 'moderate',
      dependents: 1,
      highInterestDebt: 0,
      hasHealthInsurance: true,
      hasTermInsurance: false,
    },
  }
}
