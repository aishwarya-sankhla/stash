import { daysBetween, fdValue, isoDate, lastMonths, monthlyAverages, previousMonth, recurringPayments, savingsRate, summarizeMonth, totalsByClass } from './finance'
import { formatCompactINR, formatDate, formatINR, formatMonth, formatPct, formatRate } from './format'
import { formatTimeLeft, goalStatus, type GoalStatus } from './goals'
import type { AppData, Holding, Profile } from './types'

export type Severity = 'critical' | 'warning' | 'tip' | 'good'

export interface Advice {
  id: string
  severity: Severity
  title: string
  detail: string
  /** The numbers and the rule behind the advice, one point per line, so you can judge it yourself. */
  why: string[]
}

export type PortfolioClass = 'equity' | 'debt' | 'gold'
export type Allocation = Record<PortfolioClass, number> // fractions summing to 1

export interface PlanItem {
  label: string
  amount: number
}

export interface RetirementPlan {
  years: number
  /** Long-term holdings today, and the SIPs going into them. */
  current: number
  monthlySip: number
  assumedReturn: number
  /** At retirement, in rupees of that time. Divide by `inflator` for today's money. */
  projected: number
  needed: number
  inflator: number
  /** Extra monthly investment that closes the gap at the same return; 0 when on track. */
  extraMonthly: number
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
  retirement: RetirementPlan | null
}

export const EMERGENCY_MONTHS = 6
export const DRIFT_THRESHOLD = 0.05
export const STALE_VALUE_DAYS = 60
const GOLD_PCT = 10

// Long-run return and inflation assumptions for projections. Nothing is guaranteed; these are moderate.
export const INFLATION = 0.06
export const EXPECTED_RETURN: Allocation = { equity: 0.11, debt: 0.07, gold: 0.08 }
/** Corpus needed = this × yearly expenses at retirement (a 3.3% withdrawal rate, cautious for Indian inflation). */
export const RETIREMENT_MULTIPLE = 30

// Indian income tax on investments (capital-gains rules in force since July 2024), plus 4% cess.
const CESS = 0.04
export const LTCG_EXEMPTION = 125000
const EQUITY_LTCG = 0.125
const EQUITY_STCG = 0.2
/** Typical recent returns, for after-tax comparisons. */
const ARBITRAGE_RETURN = 0.07
const DEBT_FUND_RETURN = 0.07
/** Typical extra yearly cost of a Regular plan over the same fund's Direct plan (the distributor's commission). */
const REGULAR_EXTRA_COST: Record<Holding['assetClass'], number> = { equity: 0.008, debt: 0.004, gold: 0.004, cash: 0.002, realEstate: 0, other: 0.008 }

const withCess = (rate: number) => rate * (1 + CESS)
/** Funds taxed as equity: equity funds and stocks, plus arbitrage and balanced-advantage funds whatever their class in Stash. */
const equityTaxed = (h: Holding) => h.assetClass === 'equity' || /arbitrage|balanced advantage|dynamic asset allocation|equity savings/i.test(h.name)
const isRegularPlan = (h: Holding) => /\bregular\b/i.test(h.name) && !/\bdirect\b/i.test(h.name)
/** Debt mutual funds, taxed at your slab: not arbitrage, PF, PPF, NPS or gold bonds, which are taxed differently. */
const isDebtFund = (h: Holding) =>
  h.assetClass === 'debt' &&
  !/arbitrage|ppf|epf|vpf|provident|nps|pension|sgb|sovereign|gold|balanced advantage/i.test(h.name) &&
  /fund|debt|bond|gilt|duration|income|corporate|credit|psu|treasury|accrual/i.test(h.name)

/**
 * Age-based equity share ("100 minus age"), shifted by risk tolerance and kept
 * between 20% and 80%. Gold is a fixed 10%; debt gets the rest.
 */
export function targetAllocation(profile: Pick<Profile, 'age' | 'riskTolerance'>): Allocation {
  const shift = RISK_SHIFT[profile.riskTolerance]
  const equityPct = Math.min(80, Math.max(20, 100 - profile.age + shift))
  return { equity: equityPct / 100, gold: GOLD_PCT / 100, debt: (100 - equityPct - GOLD_PCT) / 100 }
}
const RISK_SHIFT = { conservative: -15, moderate: 0, aggressive: 10 }

/** Long-term holdings and SIPs grown at the target mix's return to retirement, against 30× the yearly expenses then. */
export function retirementPlan(profile: Pick<Profile, 'age' | 'retirementAge'>, current: number, monthlySip: number, monthlyExpenses: number, target: Allocation): RetirementPlan | null {
  const years = profile.retirementAge - profile.age
  if (years <= 0 || monthlyExpenses <= 0) return null
  const assumedReturn = target.equity * EXPECTED_RETURN.equity + target.debt * EXPECTED_RETURN.debt + target.gold * EXPECTED_RETURN.gold
  const monthly = (1 + assumedReturn) ** (1 / 12) - 1
  const growth = (1 + monthly) ** (years * 12)
  const projected = current * growth + (monthlySip * (growth - 1)) / monthly
  const inflator = (1 + INFLATION) ** years
  const needed = monthlyExpenses * 12 * inflator * RETIREMENT_MULTIPLE
  const extraMonthly = Math.max(0, ((needed - projected) * monthly) / (growth - 1))
  return { years, current, monthlySip, assumedReturn, projected, needed, inflator, extraMonthly }
}

const SEVERITY_ORDER: Severity[] = ['critical', 'warning', 'tip', 'good']
const CLASS_LABEL: Record<PortfolioClass, string> = { equity: 'Equity', debt: 'Debt', gold: 'Gold' }
const listNames = (names: string[], max = 3) => `${names.slice(0, max).join(', ')}${names.length > max ? ` and ${names.length - max} more` : ''}`

export function buildReport(data: AppData, currentMonth: string, today = isoDate()): AdvisorReport {
  const { profile } = data
  const advice: Advice[] = []
  const add = (a: Advice) => advice.push(a)
  const target = targetAllocation(profile)
  const shift = RISK_SHIFT[profile.riskTolerance]
  const targetRule = `Target equity = 100 − your age (${profile.age})${shift ? ` ${shift > 0 ? '+' : '−'} ${Math.abs(shift)} for ${profile.riskTolerance} risk` : ''}, kept between 20% and 80% = ${formatPct(target.equity)}. Gold is a fixed ${GOLD_PCT}%; debt gets the rest (${formatPct(target.debt)}).`

  // --- Profile ---------------------------------------------------------------
  if (!profile.confirmed) {
    add({
      id: 'profile',
      severity: 'critical',
      title: 'Set up your profile for accurate advice',
      detail: `Right now this advice assumes you're ${profile.age}, with ${profile.riskTolerance} risk tolerance, ${profile.dependents} dependents, no high-interest debt, no insurance, a ${profile.taxSlab}% tax slab and retirement at ${profile.retirementAge}. Your age and risk tolerance set your target investment mix.`,
      why: ['These are default values; nothing in Settings → About you has been changed or confirmed yet.', targetRule],
    })
  }

  // --- Cash flow -----------------------------------------------------------
  const avg = monthlyAverages(data.transactions, currentMonth)
  const rate = savingsRate(avg.income, avg.expenses)
  const surplus = avg.income - avg.expenses
  const cashFlowWhy = [
    `Average of your last ${avg.monthsUsed} completed month${avg.monthsUsed === 1 ? '' : 's'}: money in ${formatINR(avg.income)}, money out ${formatINR(avg.expenses)}, saved ${formatINR(surplus)}${rate === null ? '' : ` = ${formatPct(rate)} of income`}.`,
    'Rule of thumb: save at least 20% of income; under 10% is low. The current month is left out because it is partial.',
  ]

  if (avg.monthsUsed === 0) {
    add({
      id: 'need-data',
      severity: 'tip',
      title: 'Add at least one full month of transactions',
      detail:
        'Cash-flow advice uses your completed months (the current month is excluded because it is partial). Add income and expenses for last month to unlock it.',
      why: ['Savings rate, emergency fund, monthly plan and retirement projection all need your average monthly income and expenses, from up to 3 completed months.'],
    })
  } else if (rate !== null && rate < 0) {
    add({
      id: 'overspending',
      severity: 'critical',
      title: 'You are spending more than you earn',
      detail: `Over the last ${avg.monthsUsed} month(s) you averaged ${formatINR(avg.expenses)} in expenses against ${formatINR(avg.income)} income. Cut discretionary categories before investing.`,
      why: cashFlowWhy,
    })
  } else if (rate !== null && rate < 0.1) {
    add({
      id: 'low-savings',
      severity: 'warning',
      title: `Savings rate is low (${formatPct(rate)})`,
      detail: 'Aim to save at least 20% of income. Review your largest expense categories on the Dashboard and set budgets for them.',
      why: cashFlowWhy,
    })
  } else if (rate !== null && rate < 0.2) {
    add({
      id: 'ok-savings',
      severity: 'tip',
      title: `Savings rate is ${formatPct(rate)} — push towards 20%+`,
      detail: `Saving another ${formatINR(avg.income * 0.2 - surplus)} a month would get you to 20%.`,
      why: cashFlowWhy,
    })
  } else if (rate !== null) {
    add({
      id: 'good-savings',
      severity: 'good',
      title: `Healthy savings rate (${formatPct(rate)})`,
      detail: 'You are saving at least 20% of your income. Make sure those savings are put to work (see plan below).',
      why: cashFlowWhy,
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
      why: ['Settings says you have no health insurance.', 'A hospital stay can cost several lakh rupees, and medical costs rise faster than general inflation.'],
    })
  }
  if (!profile.hasTermInsurance && profile.dependents > 0) {
    const yearly = avg.income * 12
    add({
      id: 'term-insurance',
      severity: 'critical',
      title: 'Get term life insurance',
      detail: `You have ${profile.dependents} dependent(s). A pure term plan of roughly 10–15× annual income protects them cheaply. Avoid mixing insurance with investment (ULIPs, endowment plans).`,
      why: [
        `Settings says you have ${profile.dependents} dependent(s) and no term insurance.`,
        yearly > 0
          ? `Rule of thumb: cover of 10–15 × yearly income = ${formatCompactINR(yearly * 10)}–${formatCompactINR(yearly * 15)} for your ${formatINR(yearly)} a year.`
          : 'Rule of thumb: cover of 10–15 × your yearly income.',
      ],
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
      why: [
        `High-interest debt in Settings: ${formatINR(profile.highInterestDebt)}.`,
        `Paying it off is a guaranteed return equal to its interest rate; this plan assumes ${formatRate(EXPECTED_RETURN.equity)} a year from equity over the long run, and that isn't guaranteed.`,
      ],
    })
  }

  // --- Goals ------------------------------------------------------------------
  // Holdings linked to a goal are that goal's money: they don't count towards the emergency fund
  // or the long-term mix, which would otherwise push dated money into equity by age.
  const goals = data.goals.map((g) => goalStatus(g, data, currentMonth, target.equity))
  const goalHoldingIds = new Set(goals.flatMap((g) => g.holdings.map((h) => h.id)))
  const ungoaled = data.holdings.filter((h) => !goalHoldingIds.has(h.id))
  // Holdings and FDs switched to "emergency fund" are emergency money, so they leave the long-term mix too.
  const emergencyHoldings = ungoaled.filter((h) => h.emergency)
  const emergencyFds = data.fds.filter((fd) => fd.emergency)
  const longTerm = { ...data, holdings: ungoaled.filter((h) => !h.emergency), fds: data.fds.filter((fd) => !fd.emergency) }

  // --- Emergency fund ------------------------------------------------------
  const classTotals = totalsByClass(longTerm, today)
  const emergencyTarget = avg.expenses * EMERGENCY_MONTHS
  const markedEmergency = emergencyHoldings.reduce((s, h) => s + h.currentValue, 0) + emergencyFds.reduce((s, fd) => s + fdValue(fd, today), 0)
  const emergencyCurrent = classTotals.cash + markedEmergency
  const emergencyShortfall = Math.max(0, emergencyTarget - emergencyCurrent)
  if (avg.monthsUsed > 0) {
    const why = [
      `Target: ${EMERGENCY_MONTHS} months × average expenses of ${formatINR(avg.expenses)} = ${formatINR(emergencyTarget)}.`,
      `Counted: Cash holdings ${formatINR(classTotals.cash)}${
        markedEmergency > 0 ? ` + ${listNames([...emergencyHoldings, ...emergencyFds.map((fd) => ({ name: `${fd.bank} FD` }))].map((x) => x.name))} ${formatINR(markedEmergency)}` : ''
      } = ${formatINR(emergencyCurrent)}. Money linked to a goal doesn't count.`,
      'Count an FD or another holding by switching on its emergency fund (lifebuoy) button on the Investments tab.',
    ]
    if (emergencyShortfall > 0) {
      add({
        id: 'emergency',
        severity: emergencyCurrent < avg.expenses * 3 ? 'warning' : 'tip',
        title: `Build your emergency fund (${formatINR(emergencyCurrent)} of ${formatINR(emergencyTarget)})`,
        detail: `Keep ${EMERGENCY_MONTHS} months of expenses in a savings account, sweep FD, liquid or arbitrage fund. On the Investments tab, add your savings account as a Cash holding, and switch on the lifebuoy button on any FD or fund you keep for emergencies.`,
        why: [...why, `Short by ${formatINR(emergencyShortfall)}. Under 3 months of expenses is marked "heads up".`],
      })
    } else {
      add({
        id: 'emergency-ok',
        severity: 'good',
        title: 'Emergency fund is fully funded',
        detail: `You hold ${formatINR(emergencyCurrent)} in cash, covering ${EMERGENCY_MONTHS}+ months of expenses.`,
        why,
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
    const why = [
      `Long-term portfolio: ${formatINR(portfolioValue)} in equity, debt (including FDs) and gold. Cash, emergency fund, real estate and goal money are left out.`,
      `Now: equity ${formatPct(currentAllocation.equity)}, debt ${formatPct(currentAllocation.debt)}, gold ${formatPct(currentAllocation.gold)}.`,
      targetRule,
      `A class is flagged when it is more than ${formatPct(DRIFT_THRESHOLD)} (percentage points) away from its target.`,
    ]
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
        why,
      })
    } else {
      add({
        id: 'allocation-ok',
        severity: 'good',
        title: 'Portfolio is close to target allocation',
        detail: `Every asset class is within ${formatPct(DRIFT_THRESHOLD)} of target. Review again in 6–12 months.`,
        why,
      })
    }
  }

  for (const g of goals) {
    const name = `"${g.goal.name}"`
    const by = formatMonth(g.goal.targetDate)
    if (g.monthsLeft < 0) {
      add({ id: `goal-${g.goal.id}`, severity: 'tip', title: `Goal ${name} date has passed`, detail: 'Delete it if it is done, or move its date.', why: [`Its target month was ${by}.`] })
      continue
    }
    const why = [
      `Target ${formatINR(g.goal.target)} by ${by}, ${formatTimeLeft(g.monthsLeft)} away. Linked holdings are worth ${formatINR(g.current)}, with SIPs of ${formatINR(g.sipTotal)}/month.`,
      `Assumed return for this timeline: ${formatRate(g.assumedReturn)} a year (6.5% up to 3 years, 9% up to 7 years, 11% beyond, because money needed sooner belongs in safer funds).`,
      `Needed: the monthly amount that grows ${formatINR(g.current)} to ${formatINR(g.goal.target)} in time at that return = ${formatINR(g.needed)}. On track when your SIPs cover at least 95% of it.`,
    ]
    if (g.onTrack) {
      add({
        id: `goal-${g.goal.id}`,
        severity: 'good',
        title: `Goal ${name} is on track`,
        detail:
          g.current >= g.goal.target
            ? `You already have ${formatINR(g.current)} of ${formatINR(g.goal.target)}.`
            : `Your linked SIPs of ${formatINR(g.sipTotal)}/month cover the ${formatINR(g.needed)}/month needed to reach ${formatINR(g.goal.target)} by ${by}.`,
        why,
      })
    } else {
      add({
        id: `goal-${g.goal.id}`,
        severity: 'warning',
        title: `Goal ${name} needs ${formatINR(g.needed)} a month`,
        detail: `To grow ${formatINR(g.current)} to ${formatINR(g.goal.target)} by ${by}, invest about ${formatINR(g.needed)} a month (assuming ${+(g.assumedReturn * 100).toFixed(1)}% a year). The holdings linked to it have SIPs of ${formatINR(g.sipTotal)}/month: add a SIP to one of them, or link another holding.`,
        why,
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
        why: [
          `Equity in the linked holdings: ${formatPct(g.currentEquity)}. Suggested for ${formatTimeLeft(g.monthsLeft)}: ${formatPct(g.suggestedEquity)}.`,
          'Suggested equity by time left: 0% under 1 year, 20% under 3, 40% under 5, 60% under 7, then your long-term target. Flagged when more than 15 points above.',
        ],
      })
    }
  }

  // --- Retirement --------------------------------------------------------------
  const longTermHoldings = longTerm.holdings.filter((h) => h.assetClass === 'equity' || h.assetClass === 'debt' || h.assetClass === 'gold')
  const retirementSips = longTermHoldings.reduce((s, h) => s + (h.sip?.amount ?? 0), 0)
  const retirement = retirementPlan(profile, portfolioValue, retirementSips, avg.expenses, target)
  if (retirement) {
    const { years, inflator } = retirement
    const today$ = (n: number) => `${formatCompactINR(n)} (${formatCompactINR(n / inflator)} in today's money)`
    const why = [
      `Today: ${formatINR(retirement.current)} in long-term holdings (equity, debt including PF, NPS and FDs, and gold; not cash, emergency fund, real estate or goal money), plus SIPs of ${formatINR(retirementSips)}/month into them.`,
      `Growth: ${formatRate(retirement.assumedReturn)} a year, from your target mix at ${formatRate(EXPECTED_RETURN.equity)} for equity, ${formatRate(EXPECTED_RETURN.debt)} for debt and ${formatRate(EXPECTED_RETURN.gold)} for gold, for ${years} years. Projected: ${today$(retirement.projected)}.`,
      `Expenses: ${formatINR(avg.expenses * 12)} a year now becomes ${formatINR(avg.expenses * 12 * inflator)} a year at ${profile.retirementAge}, with ${formatPct(INFLATION)} inflation.`,
      `Needed: ${RETIREMENT_MULTIPLE} × yearly expenses at retirement = ${today$(retirement.needed)}. That lets you withdraw about 3.3% a year, a cautious rate given India's inflation.`,
      'PF contributions count only if you add them as a SIP on your PF holding (Investments → ⌄ → Monthly SIP).',
    ]
    if (retirement.extraMonthly > 0) {
      add({
        id: 'retirement',
        severity: 'warning',
        title: `Retirement: invest about ${formatINR(retirement.extraMonthly)} more a month`,
        detail: `At this pace you'd have about ${formatCompactINR(retirement.projected / inflator)} in today's money by ${profile.retirementAge}, against the ${formatCompactINR(retirement.needed / inflator)} you'd need to keep spending as you do now. An extra ${formatINR(retirement.extraMonthly)} a month in long-term SIPs closes the gap.`,
        why: [...why, `Gap: ${formatCompactINR(retirement.needed - retirement.projected)}, closed by an extra ${formatINR(retirement.extraMonthly)}/month at the same growth.`],
      })
    } else {
      add({
        id: 'retirement',
        severity: 'good',
        title: `On track to retire at ${profile.retirementAge}`,
        detail: `Your long-term money and SIPs should grow to about ${formatCompactINR(retirement.projected / inflator)} in today's money, above the ${formatCompactINR(retirement.needed / inflator)} needed for your current spending.`,
        why,
      })
    }
  }

  // --- Tax --------------------------------------------------------------------
  const slab = profile.taxSlab / 100
  const slabWhy = `Your slab: ${profile.taxSlab}% + 4% cess = ${formatRate(withCess(slab))} (Settings).`

  const regular = data.holdings.filter(isRegularPlan)
  if (regular.length > 0) {
    const costs = regular.map((h) => ({ h, cost: h.currentValue * REGULAR_EXTRA_COST[h.assetClass] }))
    const yearly = costs.reduce((s, c) => s + c.cost, 0)
    const gain = regular.reduce((s, h) => s + Math.max(0, h.currentValue - h.invested), 0)
    add({
      id: 'regular-plans',
      severity: 'warning',
      title: `Switch ${regular.length === 1 ? 'a Regular plan' : `${regular.length} Regular plans`} to Direct (about ${formatINR(yearly)} a year)`,
      detail: `${listNames(regular.map((h) => h.name))} ${regular.length === 1 ? 'pays' : 'pay'} a distributor's commission out of your returns every year, through a higher expense ratio. The Direct plan is the same fund without it. Switching counts as selling, so switch units held over a year (their gains are tax-free up to ₹1.25 lakh a year in total) and stop new SIPs in the Regular plan now.`,
      why: [
        ...costs.map(({ h, cost }) => `${h.name}: ${formatINR(h.currentValue)} × about ${formatRate(REGULAR_EXTRA_COST[h.assetClass])} a year = ${formatINR(cost)}.`),
        'Typical gap between Regular and Direct expense ratios: about 0.8% a year for equity and hybrid funds, 0.4% for debt. Check the fund factsheet for the exact figure. The cost grows with your money.',
        `Gains so far: ${formatINR(gain)}. On switching, equity units held over 12 months pay ${formatRate(EQUITY_LTCG)} only on long-term gains above ₹1.25 lakh a year; units under 12 months pay ${formatRate(EQUITY_STCG)} and usually a 1% exit load.`,
      ],
    })
  }

  const month = Number(today.slice(5, 7))
  const harvestable = data.holdings.filter((h) => equityTaxed(h) && h.currentValue > h.invested)
  const equityGains = harvestable.reduce((s, h) => s + h.currentValue - h.invested, 0)
  if (month <= 3 && equityGains >= 10000) {
    const booked = Math.min(equityGains, LTCG_EXEMPTION)
    const saved = booked * withCess(EQUITY_LTCG)
    add({
      id: 'tax-harvest',
      severity: month === 3 ? 'warning' : 'tip',
      title: `Book up to ${formatINR(booked)} of tax-free gains before 31 March`,
      detail: `Sell equity fund units held over 12 months with up to ₹1.25 lakh of gains, and buy them back the next day. The gains are tax-free this financial year, and your purchase price resets higher, so you pay about ${formatINR(saved)} less tax when you finally sell. Skip units bought in the last 12 months (taxed at 20%, often with a 1% exit load) and ELSS units still locked in, and leave room for gains you've already booked since April.`,
      why: [
        `Gains not yet taxed in equity-taxed holdings: ${formatINR(equityGains)} across ${listNames(harvestable.map((h) => h.name))}. Stash can't tell which units are over 12 months old, so this is the most you could book.`,
        `Long-term equity gains up to ${formatINR(LTCG_EXEMPTION)} per financial year (April–March) are tax-free; the unused limit doesn't carry over.`,
        `Tax saved later: ${formatINR(booked)} × ${formatRate(withCess(EQUITY_LTCG))} (12.5% + cess) = ${formatINR(saved)}.`,
        'Shown from January to March each year.',
      ],
    })
  }

  if (slab >= 0.2) {
    const newFds = data.fds.filter((fd) => !fd.emergency && fd.maturityDate > today && daysBetween(fd.startDate, today) <= 90 && fd.startDate <= today)
    const debtSips = data.holdings.filter((h) => h.sip && isDebtFund(h))
    if (newFds.length > 0 || debtSips.length > 0) {
      const afterTax = (r: number) => r * (1 - withCess(slab))
      const arbitrageLong = ARBITRAGE_RETURN * (1 - withCess(EQUITY_LTCG))
      const arbitrageShort = ARBITRAGE_RETURN * (1 - withCess(EQUITY_STCG))
      const where = [...newFds.map((fd) => `your new ${fd.bank} FD`), ...debtSips.map((h) => `your ${h.name} SIP`)]
      add({
        id: 'tax-debt',
        severity: 'tip',
        title: `New money in ${newFds.length > 0 && debtSips.length > 0 ? 'FDs and debt funds' : newFds.length > 0 ? 'FDs' : 'debt funds'} loses ${formatPct(withCess(slab))} of its returns to tax`,
        detail: `FD interest and debt fund gains are taxed at your ${profile.taxSlab}% slab (${listNames(where)}). An arbitrage fund is similarly low-risk but taxed as equity: at a typical ${formatRate(ARBITRAGE_RETURN)} it keeps about ${formatRate(arbitrageLong)} after tax if held over a year. For new money, prefer arbitrage funds for 1–3 year needs and EPF/VPF or PPF (tax-free) for long-term debt. Let existing FDs run to maturity.`,
        why: [
          slabWhy,
          ...newFds.map((fd) => `${fd.bank} FD from ${formatDate(fd.startDate)}: ${formatRate(fd.rate / 100)} × (1 − ${formatRate(withCess(slab))}) = ${formatRate(afterTax(fd.rate / 100))} after tax.`),
          ...debtSips.map((h) => `${h.name} (SIP ${formatINR(h.sip!.amount)}/month): at a typical ${formatRate(DEBT_FUND_RETURN)}, about ${formatRate(afterTax(DEBT_FUND_RETURN))} after tax.`),
          `Arbitrage fund at ${formatRate(ARBITRAGE_RETURN)}: ${formatRate(arbitrageLong)} after 12.5% + cess when held over a year, ${formatRate(arbitrageShort)} after 20% + cess if sold sooner. Its long-term gains also share the ₹1.25 lakh yearly tax-free limit.`,
          'Flagged for FDs opened in the last 90 days and debt funds with an active SIP, when your slab is 20% or more.',
        ],
      })
    }
  }

  // --- Spending insights -------------------------------------------------------
  const lastMonth = previousMonth(currentMonth)
  const last = summarizeMonth(data.transactions, lastMonth)
  const before = lastMonths(previousMonth(lastMonth), 3)
    .map((m) => summarizeMonth(data.transactions, m))
    .filter((s) => s.expenses > 0)
  if (last.expenses > 0 && before.length > 0) {
    const rises = Object.entries(last.byCategory)
      .map(([category, spent]) => ({ category, spent, usual: before.reduce((s, m) => s + (m.byCategory[category] ?? 0), 0) / before.length }))
      .filter((r) => r.spent - r.usual >= 2000 && r.spent > r.usual * 1.25)
      .sort((a, b) => b.spent - b.usual - (a.spent - a.usual))
    if (rises.length > 0) {
      const lastName = formatMonth(lastMonth).split(' ')[0]
      const range = `${formatMonth(before[0].month).split(' ')[0]}–${formatMonth(before[before.length - 1].month).split(' ')[0]}`
      add({
        id: 'spending-rise',
        severity: 'tip',
        title: `Spending jumped on ${listNames(rises.map((r) => r.category), 2)} in ${lastName}`,
        detail: `${rises
          .slice(0, 3)
          .map((r) => `${r.category}: ${formatINR(r.spent)}, ${formatINR(r.spent - r.usual)} more than usual`)
          .join('. ')}. If it wasn't a one-off, set a budget for ${rises.length === 1 ? 'it' : 'them'} on the Budgets tab.`,
        why: [
          ...rises.map((r) => `${r.category}: ${formatINR(r.spent)} in ${lastName} vs an average of ${formatINR(r.usual)} in ${range}${r.usual > 0 ? ` (+${formatPct((r.spent - r.usual) / r.usual)})` : ''}.`),
          'Flagged when last month is at least 25% and ₹2,000 above the average of the 3 months before it.',
        ],
      })
    }
  }

  const recurring = recurringPayments(data.transactions, currentMonth)
  if (recurring.length > 0) {
    const total = recurring.reduce((s, r) => s + r.monthly, 0)
    const label = (r: (typeof recurring)[number]) => (r.label === r.category ? r.category : `${r.label} (${r.category})`)
    add({
      id: 'recurring',
      severity: 'tip',
      title: `${formatINR(total)} a month goes to ${recurring.length} recurring payment${recurring.length === 1 ? '' : 's'}`,
      detail: `${listNames(recurring.map((r) => `${label(r)} ${formatINR(r.monthly)}`), 4)}. Check for subscriptions or plans you no longer use: cutting ₹500 a month frees ₹6,000 a year.`,
      why: [
        ...recurring.map((r) => `${label(r)}: about ${formatINR(r.monthly)} a month.`),
        'Found as expenses with the same note (or the same category and amount, when there is no note) in each of the last 3 completed months, within 15% of their average.',
      ],
    })
  }

  // --- Holding values going stale ----------------------------------------------
  const stale = data.holdings.filter((h) => !h.valueUpdated || daysBetween(h.valueUpdated, today) > STALE_VALUE_DAYS)
  if (stale.length > 0) {
    const names = stale.map((h) => h.name)
    add({
      id: 'stale-values',
      severity: 'tip',
      title: `Update the value of ${stale.length} holding${stale.length === 1 ? '' : 's'}`,
      detail: `${listNames(names)} ${stale.length === 1 ? "hasn't" : "haven't"} been updated in over 2 months. Check your fund app or statement and enter today's values on the Investments tab so your net worth and advice stay accurate.`,
      why: [
        ...stale.map((h) => `${h.name}: ${h.valueUpdated ? `last updated ${formatDate(h.valueUpdated)}` : 'never updated'}.`),
        `Flagged after ${STALE_VALUE_DAYS} days. SIPs add money at cost, so only an update captures growth or falls.`,
      ],
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
      why: [
        `${formatINR(fd.principal)} at ${fd.rate}% from ${formatDate(fd.startDate)}, compounded quarterly, comes to ${formatINR(fdValue(fd, fd.maturityDate))} before tax.`,
        'Shown from 30 days before maturity.',
      ],
    })
  }

  // --- Budgets (current month) ----------------------------------------------
  const thisMonth = summarizeMonth(data.transactions, currentMonth)
  for (const [category, limit] of Object.entries(data.budgets)) {
    if (!(limit > 0)) continue
    const spent = thisMonth.byCategory[category] ?? 0
    const why = [`${category} budget ${formatINR(limit)}; spent ${formatINR(spent)} so far this month (${formatPct(spent / limit)}).`, 'Warned from 80% of the budget.']
    if (spent > limit) {
      add({
        id: `budget-${category}`,
        severity: 'warning',
        title: `Over budget on ${category}`,
        detail: `Spent ${formatINR(spent)} of ${formatINR(limit)} this month (${formatINR(spent - limit)} over).`,
        why,
      })
    } else if (spent >= limit * 0.8) {
      add({
        id: `budget-${category}`,
        severity: 'tip',
        title: `Close to your ${category} budget`,
        detail: `Spent ${formatINR(spent)} of ${formatINR(limit)} this month.`,
        why,
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
    // In the 20%+ slabs, debt funds lose too much to tax; arbitrage funds and tax-free PF/PPF do the job better.
    monthlyPlan.push({ label: slab >= 0.2 ? 'Debt (EPF/VPF, PPF, arbitrage funds)' : 'Debt (PPF, EPF/VPF, debt funds)', amount: remaining * target.debt })
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
    retirement,
  }
}
