import { describe, expect, it } from 'vitest'
import { buildReport, targetAllocation } from './advisor'
import { applySips, fdValue, lastMonths, savingStreak, sipCoveredMonth } from './finance'
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
    expect(amounts['Debt (PPF, EPF/VPF, debt funds)']).toBeCloseTo(4000)
    expect(amounts['Gold (gold ETF / gold fund)']).toBeCloseTo(2000)
  })
})
