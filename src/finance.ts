import type { AssetClass, Holding, Transaction } from './types'

/** 'YYYY-MM' for a date string or Date. */
export function monthKey(date: string | Date): string {
  if (typeof date === 'string') return date.slice(0, 7)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
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

export function totalsByClass(holdings: Holding[]): Record<AssetClass, number> {
  const totals: Record<AssetClass, number> = { equity: 0, debt: 0, gold: 0, cash: 0, realEstate: 0, other: 0 }
  for (const h of holdings) totals[h.assetClass] += h.currentValue
  return totals
}
