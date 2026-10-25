import type { AppData, Goal, Holding } from './types'

export interface GoalStatus {
  goal: Goal
  holdings: Holding[]
  current: number
  /** Whole months from this month to the target month; negative once the date has passed. */
  monthsLeft: number
  assumedReturn: number
  /** Monthly investment needed to reach the target on time at the assumed return. */
  needed: number
  /** Total of the monthly SIPs on the linked holdings. */
  sipTotal: number
  onTrack: boolean
  /** Suggested equity share for this timeline, and the linked holdings' actual share (null when empty). */
  suggestedEquity: number
  currentEquity: number | null
}

export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** Conservative return assumptions: money needed soon belongs in safer, lower-return funds. */
export const goalReturn = (months: number) => (months <= 36 ? 0.065 : months <= 84 ? 0.09 : 0.11)

/** Equity share that suits the time left; 7+ years away uses the long-term target from the profile. */
export function suggestedEquity(months: number, longTermEquity: number): number {
  if (months < 12) return 0
  if (months < 36) return 0.2
  if (months < 60) return 0.4
  if (months < 84) return 0.6
  return longTermEquity
}

/** Monthly amount that grows `current` to `target` in `months` at `annualReturn`, compounded monthly. */
export function monthlyNeeded(target: number, current: number, months: number, annualReturn: number): number {
  if (months <= 0) return Math.max(0, target - current)
  const r = annualReturn / 12
  const growth = (1 + r) ** months
  const shortfall = target - current * growth
  return shortfall <= 0 ? 0 : (shortfall * r) / (growth - 1)
}

export function goalStatus(goal: Goal, data: Pick<AppData, 'holdings'>, currentMonth: string, longTermEquity: number): GoalStatus {
  const holdings = data.holdings.filter((h) => goal.holdingIds.includes(h.id))
  const current = holdings.reduce((s, h) => s + h.currentValue, 0)
  const equity = holdings.filter((h) => h.assetClass === 'equity').reduce((s, h) => s + h.currentValue, 0)
  const monthsLeft = monthsBetween(currentMonth, goal.targetDate)
  const assumedReturn = goalReturn(monthsLeft)
  const needed = monthlyNeeded(goal.target, current, monthsLeft, assumedReturn)
  const sipTotal = holdings.reduce((s, h) => s + (h.sip?.amount ?? 0), 0)
  return {
    goal,
    holdings,
    current,
    monthsLeft,
    assumedReturn,
    needed,
    sipTotal,
    onTrack: current >= goal.target || sipTotal >= needed * 0.95,
    suggestedEquity: suggestedEquity(monthsLeft, longTermEquity),
    currentEquity: current > 0 ? equity / current : null,
  }
}

/** "2 yrs 10 mo", "8 months", "this month". */
export function formatTimeLeft(months: number): string {
  if (months < 0) return 'date passed'
  if (months === 0) return 'this month'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m} month${m === 1 ? '' : 's'}`
  return `${y} yr${y === 1 ? '' : 's'}${m ? ` ${m} mo` : ''}`
}

