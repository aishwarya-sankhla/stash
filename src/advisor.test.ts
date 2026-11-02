import { describe, expect, it } from 'vitest'
import { buildReport, retirementPlan, targetAllocation } from './advisor'
import { applySips, daysBetween, fdValue, holdingReturn, lastMonths, recordNetWorth, recurringPayments, savingStreak, sipCoveredMonth, xirr } from './finance'
import { sampleData } from './sampleData'
import { DEFAULT_DATA, type AppData, type Holding, type Transaction } from './types'

const tx = (date: string, type: Transaction['type'], amount: number, category = 'Other'): Transaction => ({
  id: `${date}-${type}-${amount}`,
  date,
  type,
  amount,
  category,
  note: '',
})
const holding = (assetClass: Holding['assetClass'], currentValue: number): Holding => ({
  id: assetClass,
  name: assetClass,
  assetClass,
  invested: currentValue,
  currentValue,
})
const data = (overrides: Partial<AppData>): AppData => ({ ...DEFAULT_DATA, ...overrides })

describe('lastMonths', () => {
  it('crosses year boundaries', () => {
    expect(lastMonths('2026-01', 3)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
})

describe('savingStreak', () => {
  it('counts consecutive 20%+ months back from last month, stopping at the first miss', () => {
    const txs = [
      tx('2026-06-01', 'income', 100000),
      tx('2026-06-02', 'expense', 50000), // 50%, but June is cut off by July's miss
      tx('2026-07-01', 'income', 100000),
      tx('2026-07-02', 'expense', 81000), // 19%: breaks the streak
      tx('2026-08-01', 'income', 100000),
      tx('2026-08-02', 'expense', 80000), // exactly 20% counts
      tx('2026-09-01', 'income', 100000),
      tx('2026-09-02', 'expense', 30000),
      tx('2026-10-01', 'expense', 999999), // current month is ignored
    ]
    expect(savingStreak(txs, '2026-10')).toBe(2)
    expect(savingStreak([], '2026-10')).toBe(0)
  })
})

describe('SIPs', () => {
  const sipHolding = (lastApplied: string): Holding => ({
    ...holding('equity', 100000),
    invested: 80000,
    sip: { amount: 5000, day: 10, lastApplied },
  })

  it('adds each instalment once its day arrives, across a year boundary, and is idempotent', () => {
    const start = data({ holdings: [sipHolding('2025-11')] })
    // Dec and Jan are due by 9 Feb; Feb's instalment (day 10) is not yet
    const feb9 = applySips(start, '2026-02-09')
    expect(feb9.holdings[0]).toMatchObject({ invested: 90000, currentValue: 110000, sip: { lastApplied: '2026-01' } })
    // Each instalment is recorded on its own date, for the yearly return
    expect(feb9.holdings[0].flows).toEqual([
      { date: '2025-12-10', amount: 5000 },
      { date: '2026-01-10', amount: 5000 },
    ])
    expect(applySips(feb9, '2026-02-09')).toBe(feb9)
    expect(applySips(feb9, '2026-02-10').holdings[0]).toMatchObject({ invested: 95000, currentValue: 115000, sip: { lastApplied: '2026-02' } })
  })

  it('treats this month as already invested when a SIP is set up after its day', () => {
    expect(sipCoveredMonth('2026-10-18', 5)).toBe('2026-10')
    expect(sipCoveredMonth('2026-10-18', 18)).toBe('2026-10')
    expect(sipCoveredMonth('2026-10-18', 25)).toBe('2026-09')
    expect(sipCoveredMonth('2026-01-03', 5)).toBe('2025-12')
  })
})

describe('fdValue', () => {
  const fd = { id: 'f', bank: 'SBI', principal: 100000, rate: 7, startDate: '2026-01-01', maturityDate: '2027-01-01' }

  it('compounds quarterly to maturity and stays flat outside the deposit period', () => {
    // 100000 × (1 + 0.07/4)^4 = 107185.90 (simple or annual interest would give 107000)
    expect(fdValue(fd, '2027-01-01')).toBeCloseTo(107185.9, 1)
    expect(fdValue(fd, '2028-06-01')).toBeCloseTo(107185.9, 1)
    expect(fdValue(fd, '2026-01-01')).toBe(100000)
    expect(fdValue(fd, '2025-06-01')).toBe(100000)
  })

  it('counts FDs as debt in the allocation and flags those maturing within 30 days', () => {
    const fds = [
      { ...fd, id: 'soon', principal: 300000, startDate: '2026-10-18', maturityDate: '2026-11-17' }, // 30 days left
      { ...fd, id: 'later', principal: 1, startDate: '2026-10-18', maturityDate: '2026-11-18' }, // 31 days left
    ]
    const report = buildReport(data({ holdings: [holding('equity', 700000)], fds }), '2026-10', '2026-10-18')
    expect(report.currentAllocation?.debt).toBeCloseTo(0.3, 5)
    expect(report.advice.map((a) => a.id).filter((id) => id.startsWith('fd-'))).toEqual(['fd-soon'])
  })
})

describe('recordNetWorth', () => {
  const zero = { equity: 0, debt: 0, gold: 0, cash: 0, realEstate: 0, other: 0 }

  it('keeps one snapshot per month: updates the current month, keeps earlier months, skips no-op saves', () => {
    const sep = { month: '2026-09', total: 500, byClass: { ...zero, equity: 500 } }
    const start = data({ holdings: [holding('equity', 600.4), holding('gold', 99.7)], netWorth: [sep] })

    const oct = recordNetWorth(start, '2026-10-03')
    expect(oct.netWorth).toEqual([sep, { month: '2026-10', total: 700, byClass: { ...zero, equity: 600, gold: 100 } }])
    expect(recordNetWorth(oct, '2026-10-20')).toBe(oct)

    const updated = recordNetWorth({ ...oct, holdings: [holding('equity', 800)] }, '2026-10-20')
    expect(updated.netWorth).toEqual([sep, { month: '2026-10', total: 800, byClass: { ...zero, equity: 800 } }])
  })

  it('records nothing until there is something to record', () => {
    const empty = data({})
    expect(recordNetWorth(empty, '2026-10-18')).toBe(empty)
  })
})

describe('buildReport profile prompt', () => {
  it('leads with a profile prompt until the profile is confirmed', () => {
    const unconfirmed = buildReport(data({}), '2026-10')
    expect(unconfirmed.advice[0].id).toBe('profile')

    const confirmed = buildReport(data({ profile: { ...DEFAULT_DATA.profile, confirmed: true } }), '2026-10')
    expect(confirmed.advice.some((a) => a.id === 'profile')).toBe(false)
  })
})

describe('buildReport cash flow', () => {
  it('averages completed months with data, ignoring the partial current month and empty months', () => {
    const report = buildReport(
      data({
        transactions: [
          tx('2026-07-01', 'income', 100000),
          tx('2026-07-10', 'expense', 40000),
          // August has no transactions and must not drag the average down
          tx('2026-09-01', 'income', 100000),
          tx('2026-09-10', 'expense', 60000),
          // Current month (October) is partial and excluded
          tx('2026-10-02', 'expense', 500000),
        ],
      }),
      '2026-10',
    )
    expect(report.monthsUsed).toBe(2)
    expect(report.avgIncome).toBe(100000)
    expect(report.avgExpenses).toBe(50000)
    expect(report.savingsRate).toBeCloseTo(0.5)
  })
})

describe('targetAllocation', () => {
  it('uses 100 minus age, shifted by risk, clamped to 20–80% equity', () => {
    expect(targetAllocation({ age: 30, riskTolerance: 'moderate' })).toEqual({ equity: 0.7, debt: 0.2, gold: 0.1 })
    expect(targetAllocation({ age: 25, riskTolerance: 'aggressive' }).equity).toBe(0.8)
    expect(targetAllocation({ age: 70, riskTolerance: 'conservative' }).equity).toBe(0.2)
    const a = targetAllocation({ age: 45, riskTolerance: 'conservative' })
    expect(a.equity + a.debt + a.gold).toBeCloseTo(1)
  })
})

describe('buildReport rebalancing', () => {
  it('reports drift amounts in rupees and ignores cash/real estate in the portfolio', () => {
    const report = buildReport(
      data({
        holdings: [holding('equity', 900000), holding('debt', 100000), holding('cash', 500000), holding('realEstate', 5000000)],
      }),
      '2026-10',
    )
    expect(report.portfolioValue).toBe(1000000)
    const rebalance = report.advice.find((a) => a.id === 'rebalance')!
    expect(rebalance.detail).toContain('Equity is 90% vs target 70% — reduce about ₹2,00,000')
    expect(rebalance.detail).toContain('Debt is 10% vs target 20% — add about ₹1,00,000')
    expect(rebalance.detail).toContain('Gold is 0% vs target 10% — add about ₹1,00,000')
  })
})

describe('buildReport monthly plan', () => {
  const months = [tx('2026-09-01', 'income', 80000), tx('2026-09-05', 'expense', 50000)]

  it('fills the emergency fund before investing', () => {
    const report = buildReport(data({ transactions: months }), '2026-10')
    // Target 6 × 50,000 = 3,00,000; gap/6 = 50,000 > surplus, so all 30,000 goes to the fund
    expect(report.monthlyPlan).toEqual([{ label: 'Emergency fund top-up', amount: 30000 }])
  })

  it('pays down high-interest debt after the emergency top-up, then splits the rest by target allocation', () => {
    const report = buildReport(
      data({
        transactions: months,
        holdings: [holding('cash', 288000)], // gap 12,000 → top-up 2,000/month
        profile: { ...DEFAULT_DATA.profile, highInterestDebt: 8000 },
      }),
      '2026-10',
    )
    const amounts = Object.fromEntries(report.monthlyPlan.map((p) => [p.label, p.amount]))
    expect(amounts['Emergency fund top-up']).toBeCloseTo(2000)
    expect(amounts['Extra debt repayment']).toBeCloseTo(8000)
    expect(amounts['Equity SIP (index / flexi-cap funds)']).toBeCloseTo(14000)
    // The default 30% slab steers debt money away from debt funds, which are taxed at the slab
    expect(amounts['Debt (EPF/VPF, PPF, arbitrage funds)']).toBeCloseTo(4000)
    expect(amounts['Gold (gold ETF / gold fund)']).toBeCloseTo(2000)
  })
})

describe('yearly return (XIRR)', () => {
  it('solves known rates exactly', () => {
    // 10% over exactly one year, and 21% over two years = 10% a year compounded
    expect(xirr([{ date: '2025-01-01', amount: -10000 }, { date: '2026-01-01', amount: 11000 }])).toBeCloseTo(0.1, 6)
    expect(xirr([{ date: '2025-01-01', amount: -10000 }, { date: '2027-01-01', amount: 12100 }])).toBeCloseTo(0.1, 4)
    expect(xirr([{ date: '2025-01-01', amount: -10000 }])).toBeNull()
  })

  it('accounts for when SIP money went in, unlike the simple gain', () => {
    // 12 monthly SIPs of 10,000 worth 1,30,000 a year after the first: an 8.3% simple gain, but most money was in for months, not a year
    const flows = Array.from({ length: 12 }, (_, i) => ({ date: `2025-${String(i + 1).padStart(2, '0')}-05`, amount: 10000 }))
    const h: Holding = { ...holding('equity', 130000), invested: 120000, valueUpdated: '2026-01-05', flows }
    const rate = holdingReturn(h)!.rate
    // At the true rate, every rupee in, grown to the valuation date, adds up to the value
    const grown = flows.reduce((sum, f) => sum + f.amount * (1 + rate) ** (daysBetween(f.date, '2026-01-05') / 365), 0)
    expect(grown).toBeCloseTo(130000, 0)
    expect(rate).toBeGreaterThan(0.15)
  })

  it('needs a year of history and skips cash, whose value moves with spending', () => {
    const recent: Holding = { ...holding('equity', 11000), valueUpdated: '2026-10-01', flows: [{ date: '2026-01-01', amount: 10000 }] }
    expect(holdingReturn(recent)).toBeNull()
    expect(holdingReturn({ ...recent, valueUpdated: '2027-01-01' })?.rate).toBeCloseTo(0.1, 6)
    expect(holdingReturn({ ...recent, assetClass: 'cash', valueUpdated: '2027-01-01' })).toBeNull()
  })
})

describe('tax checks', () => {
  const confirmed = { ...DEFAULT_DATA.profile, confirmed: true }

  it('prices the commission in Regular plans and leaves Direct plans alone', () => {
    const regular = { ...holding('equity', 56362), id: 'r', name: 'HDFC Balanced Advantage Fund - Regular Plan - Growth', invested: 38000 }
    const direct = { ...holding('equity', 100000), id: 'd', name: 'Axis Multicap Fund - Direct Plan - Regular Growth' }
    const advice = buildReport(data({ holdings: [regular, direct], profile: confirmed }), '2026-11', '2026-11-02').advice.find((a) => a.id === 'regular-plans')!
    expect(advice.title).toContain('₹451 a year') // 56,362 × 0.8%
    expect(advice.detail).not.toContain('Axis')
  })

  it('reminds you to book tax-free equity gains from January to March only', () => {
    const fund = { ...holding('equity', 400000), invested: 200000 }
    const arbitrage = { ...holding('debt', 110000), id: 'arb', name: 'ICICI Prudential Arbitrage Fund', invested: 100000 } // taxed as equity
    const report = (today: string) => buildReport(data({ holdings: [fund, arbitrage], profile: confirmed }), today.slice(0, 7), today).advice.find((a) => a.id === 'tax-harvest')
    expect(report('2026-11-02')).toBeUndefined()
    const feb = report('2027-02-10')!
    // Gains of 2,10,000 are capped at the 1,25,000 limit; tax saved later = 1,25,000 × 12.5% × 1.04
    expect(feb.title).toContain('₹1,25,000')
    expect(feb.detail).toContain('₹16,250')
    expect(feb.why[0]).toContain('₹2,10,000')
  })

  it('compares new FDs with arbitrage funds after tax, in the 20%+ slabs', () => {
    const fd = (startDate: string) => ({ id: startDate, bank: 'SBI', principal: 100000, rate: 7.1, startDate, maturityDate: '2027-10-01' })
    const advice = (slab: number, startDate: string) =>
      buildReport(data({ fds: [fd(startDate)], profile: { ...confirmed, taxSlab: slab } }), '2026-11', '2026-11-02').advice.find((a) => a.id === 'tax-debt')
    // 7.1% × (1 − 31.2%) = 4.9%; arbitrage 7% × (1 − 13%) = 6.1%
    expect(advice(30, '2026-10-01')!.why.join(' ')).toMatch(/7\.1% × \(1 − 31\.2%\) = 4\.9%.*6\.1% after 12\.5%/)
    expect(advice(10, '2026-10-01')).toBeUndefined()
    expect(advice(30, '2026-04-01')).toBeUndefined() // opened over 90 days ago: not new money
  })
})

describe('retirementPlan', () => {
  it('projects to retirement against 30× inflated expenses', () => {
    const target = targetAllocation({ age: 30, riskTolerance: 'moderate' }) // 70/20/10
    const plan = retirementPlan({ age: 30, retirementAge: 60 }, 0, 0, 50000, target)!
    expect(plan.assumedReturn).toBeCloseTo(0.099) // 0.7 × 11% + 0.2 × 7% + 0.1 × 8%
    expect(plan.needed).toBeCloseTo(6_00_000 * 1.06 ** 30 * 30, 0) // ≈ ₹10.3 crore at 60
    expect(plan.extraMonthly).toBeCloseTo(51095, -1)
    // Investing that much more closes the gap exactly
    expect(retirementPlan({ age: 30, retirementAge: 60 }, 0, plan.extraMonthly, 50000, target)!.projected).toBeCloseTo(plan.needed, -2)
    expect(retirementPlan({ age: 61, retirementAge: 60 }, 0, 0, 50000, target)).toBeNull()
  })
})

describe('spending insights', () => {
  const note = (date: string, amount: number, category: string, text: string): Transaction => ({ ...tx(date, 'expense', amount, category), id: `${date}-${text}`, note: text })

  it('finds payments that recur every month at a similar amount', () => {
    const txs = ['2026-08', '2026-09', '2026-10'].flatMap((m, i) => [
      note(`${m}-02`, 32000, 'Rent', 'Apartment'),
      note(`${m}-11`, 649, 'Entertainment', 'Netflix'),
      note(`${m}-15`, [1500, 2600, 2200][i], 'Utilities', 'Electricity'), // 1,500 is 29% off the average
      ...(i > 0 ? [note(`${m}-20`, 1500, 'Health', 'Gym')] : []), // only 2 of the 3 months
    ])
    expect(recurringPayments(txs, '2026-11')).toEqual([
      { label: 'Apartment', category: 'Rent', monthly: 32000 },
      { label: 'Netflix', category: 'Entertainment', monthly: 649 },
    ])
  })

  it('flags categories well above their usual level last month', () => {
    const txs = ['2026-07', '2026-08', '2026-09', '2026-10'].flatMap((m, i) => [
      tx(`${m}-05`, 'expense', i === 3 ? 15000 : 8000, 'Shopping'),
      tx(`${m}-06`, 'expense', i === 3 ? 6000 : 5000, 'Dining'), // +20%: within the normal range
    ])
    const advice = buildReport(data({ transactions: txs }), '2026-11', '2026-11-02').advice.find((a) => a.id === 'spending-rise')!
    expect(advice.title).toBe('Spending jumped on Shopping in Oct')
    expect(advice.detail).toContain('₹7,000 more than usual')
  })
})

describe('why', () => {
  it('backs every piece of advice with its numbers and rule', () => {
    const report = buildReport(sampleData(new Date(2027, 1, 10)), '2027-02', '2027-02-10')
    expect(report.advice.length).toBeGreaterThan(5)
    for (const a of report.advice) expect(a.why.length, a.id).toBeGreaterThan(0)
  })
})
