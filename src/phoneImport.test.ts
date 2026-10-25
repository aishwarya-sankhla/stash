import { describe, expect, it } from 'vitest'
import { parsePhoneExpenses } from './phoneImport'

describe('parsePhoneExpenses', () => {
  const file = [
    '\uFEFF2026-10-25 14:03:22 | 250 | Groceries | Milk and bread\r',
    '2026-10-25 19:40:05 | 1,250.50 | dining | Dinner | with friends',
    '2026-10-26 08:00:00 | ₹90 | Chai | ',
    '',
    '2026-02-30 10:00:00 | 100 | Rent | not a real day',
    '2026-10-26 09:00:00 | -50 | Dining | negative',
    '2026-10-26 09:00:00 | 500000000 | Shopping | typo-sized',
    '<script>alert(1)</script>',
    '2026-10-25 14:03:22 | 250 | Groceries | Milk and bread',
  ].join('\n')

  it('reads valid lines, keeps unknown categories in the note, and reports unreadable lines by number', () => {
    const { fresh, duplicates, rejected } = parsePhoneExpenses(file, [])
    expect(fresh.map(({ id: _id, ...t }) => t)).toEqual([
      { date: '2026-10-25', type: 'expense', category: 'Groceries', amount: 250, note: 'Milk and bread' },
      { date: '2026-10-25', type: 'expense', category: 'Dining', amount: 1250.5, note: 'Dinner | with friends' },
      { date: '2026-10-26', type: 'expense', category: 'Other', amount: 90, note: 'Chai' },
    ])
    expect(rejected.map((r) => r.line)).toEqual([5, 6, 7, 8])
    expect(duplicates).toBe(1) // the repeated first line
  })

  it('skips expenses already imported from an earlier file', () => {
    const first = parsePhoneExpenses(file, [])
    const again = parsePhoneExpenses(`${file}\n2026-10-27 12:00:00 | 60 | Transport | Auto`, first.fresh)
    expect(again.fresh.map((t) => t.note)).toEqual(['Auto'])
    expect(again.duplicates).toBe(4)
  })
})
