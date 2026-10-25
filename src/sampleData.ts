import { isoDate, lastMonths, monthKey, nextMonth, sipCoveredMonth, totalsByClass } from './finance'
import { newId } from './format'
import type { AppData, AssetClass, FixedDeposit, Holding, NetWorthSnapshot, Transaction } from './types'

/** Six months of realistic demo data ending in the current month. */
const shiftDays = (d: Date, days: number) => isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days))

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

  const holdings: Holding[] = [
    { id: newId(), name: 'Nifty 50 index fund', assetClass: 'equity', invested: 420000, currentValue: 545000, valueUpdated: shiftDays(today, -12), sip: { amount: 10000, day: 5, lastApplied: sipCoveredMonth(isoDate(today), 5) } },
    { id: newId(), name: 'Flexi-cap mutual fund', assetClass: 'equity', invested: 250000, currentValue: 301000, valueUpdated: shiftDays(today, -12), sip: { amount: 5000, day: 25, lastApplied: sipCoveredMonth(isoDate(today), 25) } },
    { id: newId(), name: 'Direct stocks', assetClass: 'equity', invested: 150000, currentValue: 162000, valueUpdated: shiftDays(today, -75) },
    { id: newId(), name: 'EPF', assetClass: 'debt', invested: 280000, currentValue: 312000, valueUpdated: shiftDays(today, -12) },
    { id: newId(), name: 'PPF', assetClass: 'debt', invested: 90000, currentValue: 98000, valueUpdated: shiftDays(today, -12) },
    { id: newId(), name: 'Sovereign Gold Bonds', assetClass: 'gold', invested: 60000, currentValue: 84000, valueUpdated: shiftDays(today, -12) },
    { id: 'sample-car-fund', name: 'Arbitrage fund (car fund)', assetClass: 'debt', invested: 150000, currentValue: 156500, valueUpdated: shiftDays(today, -12), sip: { amount: 10000, day: 10, lastApplied: sipCoveredMonth(isoDate(today), 10) } },
    { id: newId(), name: 'Savings account + sweep FD', assetClass: 'cash', invested: 480000, currentValue: 480000, valueUpdated: shiftDays(today, -12) },
  ]
  const fds: FixedDeposit[] = [
    { id: newId(), bank: 'SBI', principal: 200000, rate: 7.1, startDate: shiftDays(today, -345), maturityDate: shiftDays(today, 20) },
    { id: newId(), bank: 'HDFC Bank', principal: 150000, rate: 7.25, startDate: shiftDays(today, -120), maturityDate: shiftDays(today, 610) },
  ]

  // A year of past month-end snapshots growing towards today's totals (this month is recorded live).
  const now = totalsByClass({ holdings, fds }, isoDate(today))
  const netWorth: NetWorthSnapshot[] = lastMonths(currentMonth, 12).slice(0, -1).map((month, i) => {
    const back = 11 - i // months before now
    const growth = (cls: AssetClass) => {
      if (cls === 'equity') return 1 - back * 0.03 + Math.sin(i * 1.7) * 0.025 // SIPs plus market swings
      if (cls === 'cash') return 1 - back * 0.012 + Math.cos(i * 1.3) * 0.02
      return 1 - back * 0.015
    }
    const byClass = Object.fromEntries(Object.entries(now).map(([cls, v]) => [cls, Math.round(v * growth(cls as AssetClass))])) as Record<AssetClass, number>
    return { month, total: Object.values(byClass).reduce((s, v) => s + v, 0), byClass }
  })

  let carDate = currentMonth
  for (let i = 0; i < 30; i++) carDate = nextMonth(carDate)

  return {
    transactions,
    budgets: { Groceries: 12000, Dining: 6000, Shopping: 8000, Entertainment: 3000, Transport: 5500 },
    holdings,
    fds,
    netWorth,
    goals: [{ id: newId(), name: 'Car down payment', target: 600000, targetDate: carDate, holdingIds: ['sample-car-fund'] }],
    profile: {
      age: 31,
      riskTolerance: 'moderate',
      dependents: 1,
      highInterestDebt: 0,
      hasHealthInsurance: true,
      hasTermInsurance: false,
      confirmed: true,
    },
  }
}
