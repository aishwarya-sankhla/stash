import type { AppData, AssetClass, FixedDeposit, Flow, Holding, Transaction } from './types'

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

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return monthKey(new Date(y, m, 1))
}

/** The instalment month already covered when a SIP is set up today: this month if its day has passed, else last month. */
export function sipCoveredMonth(today: string, day: number): string {
  const month = today.slice(0, 7)
  return Number(today.slice(8)) >= day ? month : previousMonth(month)
}

/** Money added to a holding at cost on `date`: invested and current value both grow by `amount`. */
export const addMoney = (h: Holding, amount: number, date: string): Holding => ({
  ...h,
  invested: h.invested + amount,
  currentValue: h.currentValue + amount,
  flows: [...(h.flows ?? []), { date, amount }],
})

/**
 * Adds every SIP instalment that has fallen due since it was last applied, up to `today`.
 * Returns the same object when nothing is due, so callers can skip saving.
 */
export function applySips(data: AppData, today: string): AppData {
  const month = today.slice(0, 7)
  const day = Number(today.slice(8))
  let changed = false
  const holdings = data.holdings.map((h) => {
    if (!h.sip) return h
    let { lastApplied } = h.sip
    let next = h
    for (let m = nextMonth(lastApplied); m <= month && !(m === month && day < h.sip.day); m = nextMonth(m)) {
      next = addMoney(next, h.sip.amount, `${m}-${String(h.sip.day).padStart(2, '0')}`)
      lastApplied = m
    }
    if (next === h) return h
    changed = true
    return { ...next, sip: { ...h.sip, lastApplied } }
  })
  return changed ? { ...data, holdings } : data
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

/**
 * Records this month's net worth (latest value wins), so the history grows by one point per month.
 * Returns the same object when nothing changed, so callers can skip saving.
 */
export function recordNetWorth(data: AppData, today: string): AppData {
  const raw = totalsByClass(data, today)
  const byClass = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.round(v)])) as Record<AssetClass, number>
  const total = Object.values(byClass).reduce((s, v) => s + v, 0)
  const month = monthKey(today)
  const existing = data.netWorth.find((s) => s.month === month)
  if (existing ? existing.total === total && (Object.keys(byClass) as AssetClass[]).every((k) => existing.byClass[k] === byClass[k]) : total === 0) return data
  const others = data.netWorth.filter((s) => s.month !== month)
  return { ...data, netWorth: [...others, { month, total, byClass }].sort((a, b) => a.month.localeCompare(b.month)) }
}

/** Yearly returns are shown only with at least a year of history; shorter periods annualise into misleading numbers. */
export const MIN_XIRR_DAYS = 365

/**
 * XIRR: the yearly rate at which dated cash flows net to zero. Money you put in is negative, money you get
 * back (or still hold) is positive. Null when there is nothing to solve, such as only money in.
 */
export function xirr(cashflows: Flow[]): number | null {
  if (!cashflows.some((f) => f.amount < 0) || !cashflows.some((f) => f.amount > 0)) return null
  const start = cashflows.reduce((min, f) => (f.date < min ? f.date : min), cashflows[0].date)
  const npv = (rate: number) => cashflows.reduce((sum, f) => sum + f.amount / (1 + rate) ** (daysBetween(start, f.date) / 365), 0)
  let [lo, hi] = [-0.99, 10]
  if (npv(lo) * npv(hi) > 0) return null
  // Bisection: slower than Newton's method but can't diverge, and 100 halvings are plenty precise.
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (npv(lo) * npv(mid) <= 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

/** A holding's cash flows from your side: money in is negative, and its current value comes back on the day it was last valued. */
function holdingCashflows(h: Holding): Flow[] {
  const flows = h.flows ?? []
  if (flows.length === 0) return []
  const lastFlow = flows[flows.length - 1].date
  const valuedOn = h.valueUpdated && h.valueUpdated > lastFlow ? h.valueUpdated : lastFlow
  return [...flows.map((f) => ({ date: f.date, amount: -f.amount })), { date: valuedOn, amount: h.currentValue }]
}

export interface YearlyReturn {
  rate: number
  /** Date of the first cash flow: the first purchase, or the day Stash started tracking. */
  since: string
}

function yearlyReturn(cashflows: Flow[]): YearlyReturn | null {
  if (cashflows.length < 2) return null
  const dates = cashflows.map((f) => f.date).sort()
  if (daysBetween(dates[0], dates[dates.length - 1]) < MIN_XIRR_DAYS) return null
  const rate = xirr(cashflows)
  return rate === null ? null : { rate, since: dates[0] }
}

/**
 * XIRR for one holding, or null with under a year of history. Cash holdings have none: their value
 * changes when you spend or save, not because of returns.
 */
export const holdingReturn = (h: Holding): YearlyReturn | null => (h.assetClass === 'cash' ? null : yearlyReturn(holdingCashflows(h)))

/** XIRR across all holdings (except cash) and FDs together. */
export function portfolioReturn(data: Pick<AppData, 'holdings' | 'fds'>, today: string): YearlyReturn | null {
  const cashflows = data.holdings.filter((h) => h.assetClass !== 'cash').flatMap(holdingCashflows)
  for (const fd of data.fds) {
    if (fd.startDate > today) continue
    const until = fd.maturityDate < today ? fd.maturityDate : today
    cashflows.push({ date: fd.startDate, amount: -fd.principal }, { date: until, amount: fdValue(fd, until) })
  }
  return yearlyReturn(cashflows)
}

export interface RecurringPayment {
  label: string
  category: string
  monthly: number
}

/**
 * Expenses that came back in each of the last `months` completed months at a similar total (within 15%
 * of their average), such as rent, EMIs and subscriptions. Entries match on their note, or on category
 * and exact amount when they have no note.
 */
export function recurringPayments(transactions: Transaction[], currentMonth: string, months = 3): RecurringPayment[] {
  const window = lastMonths(previousMonth(currentMonth), months)
  const totals = new Map<string, { label: string; category: string; byMonth: Map<string, number> }>()
  for (const t of transactions) {
    const month = monthKey(t.date)
    if (t.type !== 'expense' || !window.includes(month)) continue
    const note = t.note.trim()
    const key = note ? `note:${note.toLowerCase()}` : `amount:${t.category}:${t.amount}`
    const entry = totals.get(key) ?? { label: note || t.category, category: t.category, byMonth: new Map() }
    entry.byMonth.set(month, (entry.byMonth.get(month) ?? 0) + t.amount)
    totals.set(key, entry)
  }
  const found: RecurringPayment[] = []
  for (const { label, category, byMonth } of totals.values()) {
    if (byMonth.size < months) continue
    const amounts = [...byMonth.values()]
    const average = amounts.reduce((sum, a) => sum + a, 0) / amounts.length
    if (amounts.every((a) => Math.abs(a - average) <= average * 0.15)) found.push({ label, category, monthly: average })
  }
  return found.sort((a, b) => b.monthly - a.monthly)
}
