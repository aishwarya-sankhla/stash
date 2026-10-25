import { daysBetween, fdValue, isoDate, monthlyAverages, savingsRate, summarizeMonth, totalsByClass } from './finance'
import { formatDate, formatINR, formatMonth, formatPct } from './format'
import { formatTimeLeft, goalStatus, type GoalStatus } from './goals'
import type { AppData, Profile } from './types'

export type Severity = 'critical' | 'warning' | 'tip' | 'good'

export interface Advice {
  id: string
  severity: Severity
  title: string
  detail: string
}

export type PortfolioClass = 'equity' | 'debt' | 'gold'
export type Allocation = Record<PortfolioClass, number> // fractions summing to 1

export interface PlanItem {
  label: string
  amount: number
}

export interface AdvisorReport {
  advice: Advice[]
  avgIncome: number
  avgExpenses: number
  monthsUsed: number
  savingsRate: number | null
  emergencyTarget: number
  emergencyCurrent: number
  targetAllocation: Allocation
  currentAllocation: Allocation | null
  portfolioValue: number
  monthlyPlan: PlanItem[]
  goals: GoalStatus[]
}

export const EMERGENCY_MONTHS = 6
export const DRIFT_THRESHOLD = 0.05
export const STALE_VALUE_DAYS = 60
const GOLD_PCT = 10

/**
 * Age-based equity share ("100 minus age"), shifted by risk tolerance and kept
 * between 20% and 80%. Gold is a fixed 10%; debt gets the rest.
 */
export function targetAllocation(profile: Pick<Profile, 'age' | 'riskTolerance'>): Allocation {
  const shift = { conservative: -15, moderate: 0, aggressive: 10 }[profile.riskTolerance]
  const equityPct = Math.min(80, Math.max(20, 100 - profile.age + shift))
  return { equity: equityPct / 100, gold: GOLD_PCT / 100, debt: (100 - equityPct - GOLD_PCT) / 100 }
}

const SEVERITY_ORDER: Severity[] = ['critical', 'warning', 'tip', 'good']
const CLASS_LABEL: Record<PortfolioClass, string> = { equity: 'Equity', debt: 'Debt', gold: 'Gold' }

export function buildReport(data: AppData, currentMonth: string, today = isoDate()): AdvisorReport {
  const { profile } = data
  const advice: Advice[] = []
  const add = (a: Advice) => advice.push(a)

  // --- Profile ---------------------------------------------------------------
  if (!profile.confirmed) {
    add({
      id: 'profile',
      severity: 'critical',
      title: 'Set up your profile for accurate advice',
      detail: `Right now this advice assumes you're ${profile.age}, with ${profile.riskTolerance} risk tolerance, ${profile.dependents} dependents, no high-interest debt and no insurance. Your age and risk tolerance set your target investment mix.`,
    })
  }

  // --- Cash flow -----------------------------------------------------------
  const avg = monthlyAverages(data.transactions, currentMonth)
  const rate = savingsRate(avg.income, avg.expenses)
  const surplus = avg.income - avg.expenses

  if (avg.monthsUsed === 0) {
    add({
      id: 'need-data',
      severity: 'tip',
      title: 'Add at least one full month of transactions',
      detail:
        'Cash-flow advice uses your completed months (the current month is excluded because it is partial). Add income and expenses for last month to unlock it.',
    })
  } else if (rate !== null && rate < 0) {
    add({
      id: 'overspending',
      severity: 'critical',
      title: 'You are spending more than you earn',
      detail: `Over the last ${avg.monthsUsed} month(s) you averaged ${formatINR(avg.expenses)} in expenses against ${formatINR(avg.income)} income. Cut discretionary categories before investing.`,
    })
  } else if (rate !== null && rate < 0.1) {
    add({
      id: 'low-savings',
      severity: 'warning',
      title: `Savings rate is low (${formatPct(rate)})`,
      detail: 'Aim to save at least 20% of income. Review your largest expense categories on the Dashboard and set budgets for them.',
    })
  } else if (rate !== null && rate < 0.2) {
    add({
      id: 'ok-savings',
      severity: 'tip',
      title: `Savings rate is ${formatPct(rate)} — push towards 20%+`,
      detail: `Saving another ${formatINR(avg.income * 0.2 - surplus)} a month would get you to 20%.`,
    })
  } else if (rate !== null) {
    add({
      id: 'good-savings',
      severity: 'good',
      title: `Healthy savings rate (${formatPct(rate)})`,
      detail: 'You are saving at least 20% of your income. Make sure those savings are put to work (see plan below).',
    })
  }

  // --- Protection ------------------------------------------------------------
  if (!profile.hasHealthInsurance) {
    add({
      id: 'health-insurance',
      severity: 'critical',
      title: 'Get health insurance',
      detail:
        'A single hospitalisation can wipe out years of savings. Buy a family floater health policy (employer cover alone may lapse if you change jobs).',
    })
  }
  if (!profile.hasTermInsurance && profile.dependents > 0) {
    add({
      id: 'term-insurance',
      severity: 'critical',
      title: 'Get term life insurance',
      detail: `You have ${profile.dependents} dependent(s). A pure term plan of roughly 10–15× annual income protects them cheaply. Avoid mixing insurance with investment (ULIPs, endowment plans).`,
    })
  }

  // --- Debt --------------------------------------------------------------------
  if (profile.highInterestDebt > 0) {
    add({
      id: 'debt',
      severity: 'critical',
      title: `Pay off ${formatINR(profile.highInterestDebt)} of high-interest debt first`,
      detail:
        'Credit cards and personal loans typically cost 14–40% a year — more than investments reliably return. After a basic emergency fund, direct surplus here before new investments.',
    })
  }

  // --- Goals ------------------------------------------------------------------
  // Holdings linked to a goal are that goal's money: they don't count towards the emergency fund
  // or the long-term mix, which would otherwise push dated money into equity by age.
  const target = targetAllocation(profile)
  const goals = data.goals.map((g) => goalStatus(g, data, currentMonth, target.equity))
  const goalHoldingIds = new Set(goals.flatMap((g) => g.holdings.map((h) => h.id)))
  const longTerm = { ...data, holdings: data.holdings.filter((h) => !goalHoldingIds.has(h.id)) }

  // --- Emergency fund ------------------------------------------------------
  const classTotals = totalsByClass(longTerm, today)
  const emergencyTarget = avg.expenses * EMERGENCY_MONTHS
  const emergencyCurrent = classTotals.cash
  const emergencyShortfall = Math.max(0, emergencyTarget - emergencyCurrent)
  if (avg.monthsUsed > 0) {
    if (emergencyShortfall > 0) {
      add({
        id: 'emergency',
        severity: emergencyCurrent < avg.expenses * 3 ? 'warning' : 'tip',
        title: `Build your emergency fund (${formatINR(emergencyCurrent)} of ${formatINR(emergencyTarget)})`,
        detail: `Keep ${EMERGENCY_MONTHS} months of expenses in a savings account, sweep FD or liquid fund. Add holdings with the "Cash" class on the Investments tab to count them.`,
      })
    } else {
      add({
        id: 'emergency-ok',
        severity: 'good',
        title: 'Emergency fund is fully funded',
        detail: `You hold ${formatINR(emergencyCurrent)} in cash, covering ${EMERGENCY_MONTHS}+ months of expenses.`,
      })
    }
  }

  // --- Asset allocation ------------------------------------------------------
  const portfolioValue = classTotals.equity + classTotals.debt + classTotals.gold
  let currentAllocation: Allocation | null = null
  if (portfolioValue > 0) {
    currentAllocation = {
      equity: classTotals.equity / portfolioValue,
      debt: classTotals.debt / portfolioValue,
      gold: classTotals.gold / portfolioValue,
    }
    const drifts = (Object.keys(target) as PortfolioClass[])
      .map((c) => ({ c, drift: currentAllocation![c] - target[c] }))
      .filter((d) => Math.abs(d.drift) > DRIFT_THRESHOLD)
    if (drifts.length > 0) {
      const lines = drifts.map(
        ({ c, drift }) =>
          `${CLASS_LABEL[c]} is ${formatPct(currentAllocation![c])} vs target ${formatPct(target[c])} — ${drift > 0 ? 'reduce' : 'add'} about ${formatINR(Math.abs(drift) * portfolioValue)}.`,
      )
      add({
        id: 'rebalance',
        severity: 'warning',
        title: 'Portfolio has drifted from your target allocation',
        detail: `${lines.join(' ')} Prefer redirecting new investments to underweight classes over selling, to avoid capital-gains tax and exit loads.`,
      })
    } else {
      add({
        id: 'allocation-ok',
        severity: 'good',
        title: 'Portfolio is close to target allocation',
        detail: `Every asset class is within ${formatPct(DRIFT_THRESHOLD)} of target. Review again in 6–12 months.`,
      })
    }
  }

  for (const g of goals) {
    const name = `"${g.goal.name}"`
    const by = formatMonth(g.goal.targetDate)
    if (g.monthsLeft < 0) {
      add({ id: `goal-${g.goal.id}`, severity: 'tip', title: `Goal ${name} date has passed`, detail: 'Delete it if it is done, or move its date.' })
      continue
    }
    if (g.onTrack) {
      add({
        id: `goal-${g.goal.id}`,
        severity: 'good',
        title: `Goal ${name} is on track`,
        detail:
          g.current >= g.goal.target
            ? `You already have ${formatINR(g.current)} of ${formatINR(g.goal.target)}.`
            : `Your linked SIPs of ${formatINR(g.sipTotal)}/month cover the ${formatINR(g.needed)}/month needed to reach ${formatINR(g.goal.target)} by ${by}.`,
      })
    } else {
      add({
        id: `goal-${g.goal.id}`,
        severity: 'warning',
        title: `Goal ${name} needs ${formatINR(g.needed)} a month`,
        detail: `To grow ${formatINR(g.current)} to ${formatINR(g.goal.target)} by ${by}, invest about ${formatINR(g.needed)} a month (assuming ${+(g.assumedReturn * 100).toFixed(1)}% a year). The holdings linked to it have SIPs of ${formatINR(g.sipTotal)}/month: add a SIP to one of them, or link another holding.`,
      })
    }
    if (g.currentEquity !== null && g.currentEquity > g.suggestedEquity + 0.15) {
      add({
        id: `goal-risk-${g.goal.id}`,
        severity: 'warning',
        title: `Goal ${name} is riskier than its timeline`,
        detail:
          g.monthsLeft < 12
            ? `It's ${formatTimeLeft(g.monthsLeft)} away but ${formatPct(g.currentEquity)} is in equity. Move the equity part into an arbitrage or liquid fund so a market fall can't shrink it before you need it.`
            : `It's ${formatTimeLeft(g.monthsLeft)} away: aim for about ${formatPct(g.suggestedEquity)} in equity, but it's ${formatPct(g.currentEquity)} now. Direct new money for this goal to arbitrage or debt funds.`,
      })
    }
  }

  // --- Holding values going stale ----------------------------------------------
  const stale = data.holdings.filter((h) => !h.valueUpdated || daysBetween(h.valueUpdated, today) > STALE_VALUE_DAYS)
  if (stale.length > 0) {
    const names = stale.map((h) => h.name)
    add({
      id: 'stale-values',
      severity: 'tip',
      title: `Update the value of ${stale.length} holding${stale.length === 1 ? '' : 's'}`,
      detail: `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''} ${stale.length === 1 ? "hasn't" : "haven't"} been updated in over 2 months. Check your fund app or statement and enter today's values on the Investments tab so your net worth and advice stay accurate.`,
    })
  }

  // --- FDs maturing soon -------------------------------------------------------
  for (const fd of data.fds) {
    const daysLeft = daysBetween(today, fd.maturityDate)
    if (daysLeft < 0 || daysLeft > 30) continue
    add({
      id: `fd-${fd.id}`,
      severity: 'tip',
      title: `${fd.bank} FD matures ${daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}`,
      detail: `${formatINR(fdValue(fd, fd.maturityDate))} is due on ${formatDate(fd.maturityDate)}. Decide in advance: renew it, top up your emergency fund, or invest it per your plan. Some banks auto-renew at the then-current rate.`,
    })
  }

  // --- Budgets (current month) ----------------------------------------------
  const thisMonth = summarizeMonth(data.transactions, currentMonth)
  for (const [category, limit] of Object.entries(data.budgets)) {
    if (!(limit > 0)) continue
    const spent = thisMonth.byCategory[category] ?? 0
    if (spent > limit) {
      add({
        id: `budget-${category}`,
        severity: 'warning',
        title: `Over budget on ${category}`,
        detail: `Spent ${formatINR(spent)} of ${formatINR(limit)} this month (${formatINR(spent - limit)} over).`,
      })
    } else if (spent >= limit * 0.8) {
      add({
        id: `budget-${category}`,
        severity: 'tip',
        title: `Close to your ${category} budget`,
        detail: `Spent ${formatINR(spent)} of ${formatINR(limit)} this month.`,
      })
    }
  }

  // --- Monthly plan: emergency fund → debt → goals → investments --------------
  const monthlyPlan: PlanItem[] = []
  let remaining = Math.max(0, surplus)
  if (remaining > 0 && emergencyShortfall > 0) {
    const topUp = Math.min(remaining, emergencyShortfall / 6) // fill the gap in ~6 months
    monthlyPlan.push({ label: 'Emergency fund top-up', amount: topUp })
    remaining -= topUp
  }
  if (remaining > 0 && profile.highInterestDebt > 0) {
    const payment = Math.min(remaining, profile.highInterestDebt)
    monthlyPlan.push({ label: 'Extra debt repayment', amount: payment })
    remaining -= payment
  }
  for (const g of goals) {
    if (remaining <= 0 || g.monthsLeft < 0 || g.needed <= 0) continue
    const amount = Math.min(remaining, g.needed)
    monthlyPlan.push({ label: `Goal: ${g.goal.name}`, amount })
    remaining -= amount
  }
  if (remaining > 0) {
    monthlyPlan.push({ label: 'Equity SIP (index / flexi-cap funds)', amount: remaining * target.equity })
    monthlyPlan.push({ label: 'Debt (PPF, EPF/VPF, debt funds)', amount: remaining * target.debt })
    monthlyPlan.push({ label: 'Gold (gold ETF / gold fund)', amount: remaining * target.gold })
  }

  advice.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))

  return {
    advice,
    avgIncome: avg.income,
    avgExpenses: avg.expenses,
    monthsUsed: avg.monthsUsed,
    savingsRate: rate,
    emergencyTarget,
    emergencyCurrent,
    targetAllocation: target,
    currentAllocation,
    portfolioValue,
    monthlyPlan,
    goals,
  }
}
