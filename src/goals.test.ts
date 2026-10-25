import { describe, expect, it } from 'vitest'
import { buildReport } from './advisor'
import { goalStatus, monthlyNeeded } from './goals'
import { DEFAULT_DATA, type AppData, type Holding } from './types'

const holding = (id: string, assetClass: Holding['assetClass'], currentValue: number, sip?: number): Holding => ({
  id,
  name: id,
  assetClass,
  invested: currentValue,
  currentValue,
  ...(sip ? { sip: { amount: sip, day: 5, lastApplied: '2026-10' } } : {}),
})
const data = (overrides: Partial<AppData>): AppData => ({ ...DEFAULT_DATA, ...overrides })

describe('goals', () => {
  it('works out the monthly amount needed, using a safer return for nearer goals', () => {
    // Values computed separately with the standard future-value-of-annuity formula
    expect(monthlyNeeded(600000, 156500, 30, 0.065)).toBeCloseTo(12806.91, 1)
    expect(monthlyNeeded(1000000, 0, 60, 0.09)).toBeCloseTo(13258.36, 1)
    expect(monthlyNeeded(100000, 40000, 0, 0.065)).toBe(60000) // due now: the whole gap
    expect(monthlyNeeded(100000, 200000, 24, 0.065)).toBe(0)

    const goal = { id: 'g', name: 'Car', target: 600000, targetDate: '2029-04', holdingIds: ['arb'] }
    const status = goalStatus(goal, { holdings: [holding('arb', 'debt', 156500, 13000)] }, '2026-10', 0.7)
    expect(status.monthsLeft).toBe(30)
    expect(status.needed).toBeCloseTo(12806.91, 1) // 30 months away → 6.5% assumption
    expect(status.onTrack).toBe(true) // ₹13,000 of SIPs covers it
  })

  it('keeps goal money out of the emergency fund and the long-term mix, and plans for the goal first', () => {
    const holdings = [holding('eq', 'equity', 700000), holding('car', 'debt', 300000), holding('carcash', 'cash', 50000), holding('bank', 'cash', 80000)]
    const goals = [{ id: 'g', name: 'Car', target: 600000, targetDate: '2029-04', holdingIds: ['car', 'carcash'] }]
    const transactions = [
      { id: 'i', date: '2026-09-01', type: 'income' as const, category: 'Salary', amount: 100000, note: '' },
      { id: 'e', date: '2026-09-02', type: 'expense' as const, category: 'Rent', amount: 40000, note: '' },
    ]
    const withGoal = buildReport(data({ holdings, goals, transactions }), '2026-10', '2026-10-18')
    const without = buildReport(data({ holdings, transactions }), '2026-10', '2026-10-18')

    expect(without.currentAllocation?.equity).toBeCloseTo(0.7, 5)
    expect(withGoal.currentAllocation?.equity).toBeCloseTo(1, 5) // only the long-term equity holding is left
    expect(without.emergencyCurrent).toBe(130000)
    expect(withGoal.emergencyCurrent).toBe(80000)
    const labels = withGoal.monthlyPlan.map((p) => p.label)
    expect(labels.indexOf('Goal: Car')).toBeLessThan(labels.findIndex((l) => l.startsWith('Equity')))
  })

  it('warns when money for a near goal sits in equity', () => {
    const goals = [{ id: 'g', name: 'Wedding', target: 500000, targetDate: '2027-04', holdingIds: ['eq'] }]
    const report = buildReport(data({ holdings: [holding('eq', 'equity', 400000)], goals }), '2026-10', '2026-10-18')
    expect(report.advice.map((a) => a.id)).toContain('goal-risk-g')
  })
})
