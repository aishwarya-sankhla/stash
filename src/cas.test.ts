import { describe, expect, it } from 'vitest'
import { applyCasImport, matchHolding, parseCasText } from './cas'
import { DEFAULT_DATA, type Holding } from './types'

// Lines as pdf.js extracts them from a detailed CAMS/KFintech CAS (names and numbers made up).
const STATEMENT = [
  'Consolidated Account Statement',
  '01-Apr-2026 To 23-Oct-2026',
  'Folio No: 9104768953 / 0 KYC: OK PAN: OK',
  'B205DGG-Axis Small Cap Fund - Direct Growth - ISIN: INF846K01K35(Advisor: INA000006651) Registrar : KFINTECH',
  'Opening Unit Balance: 500.000',
  '05-Oct-2026 Purchase - Systematic Investment 5,000.00 47.393 105.5000 657.390',
  'Closing Unit Balance: 657.390 NAV on 23-Oct-2026: INR 105.5560 Total Cost Value: 64,000.00 Market Value on 23-Oct-2026: INR 69,391.13',
  'Folio No: 9104768953 / 1 KYC: OK PAN: OK',
  'B205DGG-Axis Small Cap Fund - Direct Growth - ISIN: INF846K01K35(Advisor: INA000006651) Registrar : KFINTECH',
  'Closing Unit Balance: 100.000 NAV on 23-Oct-2026: INR 105.5560 Total Cost Value: 9,500.00 Market Value on 23-Oct-2026: INR 10,555.60',
  'Folio No: 1234567 / 89',
  'P8042-HDFC Balanced Advantage Fund - Direct Plan - Growth Option',
  '(formerly HDFC Growth Fund) - ISIN: INF179K01WA6(Advisor: DIRECT) Registrar : CAMS',
  'Closing Unit Balance: 112.512 NAV on 22-Oct-2026: INR 500.9400',
  'Total Cost Value: 38,000.00 Market Value on 22-Oct-2026: INR 56,362.00',
  'G123-ICICI Prudential Gold ETF FOF - Direct Plan - Growth - ISIN: INF109KC1NT3 Registrar : CAMS',
  'Closing Unit Balance: 1,500.000 NAV on 23-Oct-2026: INR 30.0000',
  'X99-Old Closed Fund - Direct Growth - ISIN: INF000X01AB2 Registrar : CAMS',
  'Closing Unit Balance: 0.000 NAV on 23-Oct-2026: INR 12.0000 Total Cost Value: 0.00 Market Value on 23-Oct-2026: INR 0.00',
]

const holding = (id: string, name: string, extra: Partial<Holding> = {}): Holding => ({
  id,
  name,
  assetClass: 'equity',
  invested: 1000,
  currentValue: 1000,
  ...extra,
})

describe('parseCasText', () => {
  it('reads each fund, merges folios of one scheme, follows wrapped lines and skips redeemed funds', () => {
    expect(parseCasText(STATEMENT)).toEqual([
      { name: 'Axis Small Cap Fund - Direct Growth', isin: 'INF846K01K35', units: 757.39, navDate: '2026-10-23', cost: 73500, value: 79946.73 },
      // The scheme name wrapped onto the ISIN line; the closing figures wrapped onto the next line
      { name: 'HDFC Balanced Advantage Fund - Direct Plan - Growth Option', isin: 'INF179K01WA6', units: 112.512, navDate: '2026-10-22', cost: 38000, value: 56362 },
      // No market value or cost printed: value is units × NAV, cost unknown
      { name: 'ICICI Prudential Gold ETF FOF - Direct Plan - Growth', isin: 'INF109KC1NT3', units: 1500, navDate: '2026-10-23', cost: null, value: 45000 },
    ])
  })
})

describe('matchHolding', () => {
  it('prefers the ISIN, then a close name, keeping Direct and Regular plans apart', () => {
    const fund = { name: 'HDFC Balanced Advantage Fund - Direct Plan - Growth Option', isin: 'INF179K01WA6', units: 1, navDate: null, cost: null, value: 1 }
    const regular = holding('r', 'HDFC Balanced Advantage Fund - Regular Plan - Growth')
    const direct = holding('d', 'HDFC Balanced Advantage Fund - Direct Growth')
    expect(matchHolding(fund, [regular, direct])?.id).toBe('d')
    expect(matchHolding(fund, [regular, direct, holding('x', 'Something else', { isin: 'INF179K01WA6' })])?.id).toBe('x')
    expect(matchHolding(fund, [holding('n', 'Nippon India Nifty 50 Index Fund')])).toBeNull()
    expect(matchHolding(fund, [regular])).toBeNull() // never update a Regular holding with Direct plan figures
  })
})

describe('applyCasImport', () => {
  it('takes the statement values and re-adds SIP instalments that fell after the statement date', () => {
    const existing = holding('axis', 'Axis Small Cap', {
      invested: 60000,
      currentValue: 70000,
      sip: { amount: 5000, day: 25, lastApplied: '2026-10' }, // Stash already added the 25 Oct instalment
    })
    const fund = { name: 'Axis Small Cap Fund - Direct Growth', isin: 'INF846K01K35', units: 657.39, navDate: '2026-10-23', cost: 64000, value: 69391 }
    const gold = { name: 'ICICI Prudential Gold ETF FOF', isin: 'INF109KC1NT3', units: 1500, navDate: '2026-10-23', cost: null, value: 45000 }
    const next = applyCasImport(
      { ...DEFAULT_DATA, holdings: [existing] },
      [
        { fund, action: { kind: 'update', holdingId: 'axis' } },
        { fund: gold, action: { kind: 'add', assetClass: 'gold' } },
      ],
      '2026-10-27',
    )
    // The statement (23 Oct) predates the 25 Oct instalment, so it is added back once
    expect(next.holdings[0]).toMatchObject({ invested: 69000, currentValue: 74391, valueUpdated: '2026-10-23', isin: 'INF846K01K35', sip: { lastApplied: '2026-10' } })
    expect(next.holdings[1]).toMatchObject({ name: 'ICICI Prudential Gold ETF FOF', assetClass: 'gold', invested: 45000, currentValue: 45000, isin: 'INF109KC1NT3' })
  })
})
