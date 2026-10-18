import type { AppData, AssetClass, FixedDeposit, Transaction } from './types'

/** 'YYYY-MM' for a date string or Date. */
export function monthKey(date: string | Date): string {
  if (typeof date === 'string') return date.slice(0, 7)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Local calendar date as 'YYYY-MM-DD' (not UTC, which can be a day off in IST around midnight). */
export function isoDate(d = new Date()): string {
  return `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`
}

const dayNumber = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from)

/**
 * Value of a cumulative FD on `date`: interest compounded quarterly, as Indian banks do for cumulative FDs.
 * Equals the principal before the start date and stops growing at maturity.
 */
export function fdValue(fd: FixedDeposit, date: string): number {
  const tenure = daysBetween(fd.startDate, fd.maturityDate)
  const elapsed = Math.min(tenure, Math.max(0, daysBetween(fd.startDate, date)))
  return fd.principal * (1 + fd.rate / 400) ** ((4 * elapsed) / 365)
}

/** The `count` month keys ending at (and including) `endMonth`, oldest first. */
export function lastMonths(endMonth: string, count: number): string[] {
  const [y, m] = endMonth.split('-').map(Number)
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) keys.push(monthKey(new Date(y, m - 1 - i, 1)))
  return keys
}

export function previousMonth(month: string): string {
  return lastMonths(month, 2)[0]
}

export interface MonthSummary {
  month: string
  income: number
  expenses: number
  byCategory: Record<string, number>
}

export function summarizeMonth(transactions: Transaction[], month: string): MonthSummary {
  const summary: MonthSummary = { month, income: 0, expenses: 0, byCategory: {} }
  for (const t of transactions) {
    if (monthKey(t.date) !== month) continue
    if (t.type === 'income') summary.income += t.amount
    else {
      summary.expenses += t.amount
      summary.byCategory[t.category] = (summary.byCategory[t.category] ?? 0) + t.amount
    }
  }
  return summary
}

export function savingsRate(income: number, expenses: number): number | null {
  return income > 0 ? (income - expenses) / income : null
}

/**
 * Average monthly income and expenses over the last `count` completed months
 * (the current, partial month is excluded) that have any transactions.
 */
export function monthlyAverages(transactions: Transaction[], currentMonth: string, count = 3) {
  const months = lastMonths(previousMonth(currentMonth), count)
    .map((m) => summarizeMonth(transactions, m))
    .filter((s) => s.income > 0 || s.expenses > 0)
  if (months.length === 0) return { income: 0, expenses: 0, monthsUsed: 0 }
  const total = months.reduce((acc, s) => ({ income: acc.income + s.income, expenses: acc.expenses + s.expenses }), {
    income: 0,
    expenses: 0,
  })
  return { income: total.income / months.length, expenses: total.expenses / months.length, monthsUsed: months.length }
}

/**
 * Consecutive completed months, counting back from last month, in which you
 * saved at least `minRate` of your income. The current, partial month is ignored.
 */
export function savingStreak(transactions: Transaction[], currentMonth: string, minRate = 0.2): number {
  let streak = 0
  for (let month = previousMonth(currentMonth); ; month = previousMonth(month)) {
    const s = summarizeMonth(transactions, month)
    const rate = savingsRate(s.income, s.expenses)
    if (rate === null || rate < minRate) return streak
    streak++
  }
}

/** Current value per asset class on `today`. FDs count as debt. */
export function totalsByClass(data: Pick<AppData, 'holdings' | 'fds'>, today: string): Record<AssetClass, number> {
  const totals: Record<AssetClass, number> = { equity: 0, debt: 0, gold: 0, cash: 0, realEstate: 0, other: 0 }
  for (const h of data.holdings) totals[h.assetClass] += h.currentValue
  for (const fd of data.fds) totals.debt += fdValue(fd, today)
  return totals
}
