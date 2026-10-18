import { describe, expect, it } from 'vitest'
import { buildReport, targetAllocation } from './advisor'
import { lastMonths } from './finance'
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
