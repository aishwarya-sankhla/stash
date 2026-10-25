import { describe, expect, it } from 'vitest'
import { parseData } from './store'

describe('parseData', () => {
  it('drops or repairs malformed entries from a crafted data file instead of passing them to the UI', () => {
    const data = parseData(
      JSON.stringify({
        transactions: [
          { id: 'a', date: '2026-10-02', type: 'expense', category: 'constructor', amount: 100, note: 'odd category' },
          { id: 'b', date: '2026-10-02', type: 'expense', category: 'Rent', amount: 'lots' },
          { id: 'c', date: 'yesterday', type: 'income', category: 'Salary', amount: 5 },
          { id: 'd', date: '2026-10-03', type: 'income', category: 'Salary', amount: 5000, note: 7 },
          'not an object',
        ],
        holdings: [
          { id: 'h1', name: 'Coin', assetClass: 'crypto', invested: 1, currentValue: 1 },
          { id: 'h2', name: 'Index fund', assetClass: 'equity', invested: 10, currentValue: 12, sip: { amount: 500, day: 31, lastApplied: '2026-09' } },
        ],
        fds: [
          { id: 'f1', bank: 'SBI', principal: 100000, rate: 7.1, startDate: '2026-01-01', maturityDate: '2027-01-01' },
          { id: 'f2', bank: 'Backwards', principal: 100000, rate: 7, startDate: '2027-01-01', maturityDate: '2026-01-01' },
          { id: 'f3', bank: 'Typo', principal: 100000, rate: 710, startDate: '2026-01-01', maturityDate: '2027-01-01' },
        ],
        budgets: { Dining: 6000, constructor: 5, Rent: -1, Shopping: '9000' },
        profile: { age: 'old', riskTolerance: 'yolo', confirmed: true },
        goals: [
          { id: 'g1', name: 'Car', target: 600000, targetDate: '2029-04', holdingIds: ['h2', 'h1', 'gone', 'h2'] },
          { id: 'g2', name: 'Bad date', target: 1000, targetDate: '2029-13', holdingIds: [] },
          { id: 'g3', name: '', target: 1000, targetDate: '2029-01', holdingIds: [] },
        ],
        netWorth: [
          { month: '2026-09', byClass: { equity: 300, debt: 200 } },
          { month: '2026-13', total: 1, byClass: { equity: 1 } },
          { month: '2026-08', total: 1e9, byClass: { equity: 100, gold: -50, cash: 'lots', toString: 5 } },
          { month: '2026-09', total: 900, byClass: { equity: 900 } },
        ],
      }),
    )
    expect(data.transactions).toEqual([
      { id: 'a', date: '2026-10-02', type: 'expense', category: 'Other', amount: 100, note: 'odd category' },
      { id: 'd', date: '2026-10-03', type: 'income', category: 'Salary', amount: 5000, note: '' },
    ])
    expect(data.holdings.map((h) => h.id)).toEqual(['h2'])
    expect(data.holdings[0].sip).toBeUndefined() // day 31 isn't a valid SIP day; the holding itself is kept
    expect(data.fds.map((f) => f.id)).toEqual(['f1'])
    expect(data.budgets).toEqual({ Dining: 6000 })
    expect(data.profile).toMatchObject({ age: 30, riskTolerance: 'moderate', confirmed: true })
    // Goals keep only links to holdings that survived parsing (h1 was dropped), once each
    expect(data.goals).toEqual([{ id: 'g1', name: 'Car', target: 600000, targetDate: '2029-04', holdingIds: ['h2'] }])
    // Invalid months dropped, totals recomputed from valid class values, one entry per month (last wins), sorted
    const zero = { equity: 0, debt: 0, gold: 0, cash: 0, realEstate: 0, other: 0 }
    expect(data.netWorth).toEqual([
      { month: '2026-08', total: 100, byClass: { ...zero, equity: 100 } },
      { month: '2026-09', total: 900, byClass: { ...zero, equity: 900 } },
    ])
  })

  it('rejects JSON that is not Stash data', () => {
    expect(() => parseData('[1, 2]')).toThrow()
    expect(() => parseData('{"name": "some-other-app", "version": "1.0.0"}')).toThrow()
  })
})
