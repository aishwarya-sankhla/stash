import { describe, expect, it } from 'vitest'
import { applyCasImport, casOutline, matchHolding, parseCasText } from './cas'
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
  // A fund whose statement starts before its first purchase, so its whole history is listed.
  const nifty = (lines: string[]) => [
    'N123-Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - ISIN: INF204KB15I9 Registrar : KFINTECH',
    'Opening Unit Balance: 0.000',
    ...lines,
    'Closing Unit Balance: 380.000 NAV on 23-Oct-2026: INR 50.0000 Total Cost Value: 15,000.00 Market Value on 23-Oct-2026: INR 19,000.00',
  ]
  const purchase1 = '05-Jan-2025 Purchase - Systematic Investment (Instalment No - 1) 9,999.50 250.000 39.9980 250.000'
  const purchase2 = '05-Feb-2025 SIP Purchase - Instalment No 2 - 9,999.50 240.000 41.6646 490.000'
  const redemption = '10-Jun-2025 Redemption (5,000.00) (110.000) 45.4545 380.000'

  it('reads a full purchase history, counting stamp duty as money in and redemptions as money out', () => {
    const [fund] = parseCasText(nifty([purchase1, '05-Jan-2025 *** Stamp Duty *** 0.50', purchase2, '05-Feb-2025 *** Stamp Duty *** 0.50', redemption]))
    expect(fund.flows).toEqual([
      { date: '2025-01-05', amount: 9999.5 },
      { date: '2025-01-05', amount: 0.5 },
      { date: '2025-02-05', amount: 9999.5 },
      { date: '2025-02-05', amount: 0.5 },
      { date: '2025-06-10', amount: -5000 },
    ])
  })

  it('drops the history when a transaction is missing, so units no longer add up', () => {
    expect(parseCasText(nifty([purchase1, redemption]))[0].flows).toBeNull()
  })

  it('reads each fund, merges folios of one scheme, follows wrapped lines and skips redeemed funds', () => {
    expect(parseCasText(STATEMENT)).toEqual([
      { name: 'Axis Small Cap Fund - Direct Growth', isin: 'INF846K01K35', units: 757.39, navDate: '2026-10-23', cost: 73500, value: 79946.73, flows: null },
      // The scheme name wrapped onto the ISIN line; the closing figures wrapped onto the next line
      { name: 'HDFC Balanced Advantage Fund - Direct Plan - Growth Option', isin: 'INF179K01WA6', units: 112.512, navDate: '2026-10-22', cost: 38000, value: 56362, flows: null },
      // No market value or cost printed: value is units × NAV, cost unknown
      { name: 'ICICI Prudential Gold ETF FOF - Direct Plan - Growth', isin: 'INF109KC1NT3', units: 1500, navDate: '2026-10-23', cost: null, value: 45000, flows: null },
    ])
  })
})

describe('parseCasText on real statement layouts', () => {
  // Shapes seen in real CAMS/KFintech statements: investor address before the first folio, "Folio No :" with a
  // space, a holder-name line, and an ISIN whose value wraps behind the "Registrar :" label onto the next line.
  const REAL = [
    'Consolidated Account Statement',
    'B-12, Rose Apartments',
    'Folio No : 12345 / 67 PAN: ABCDE1234F KYC : OK PAN : OK',
    'JOHN DOE',
    'T123-Test Fund - Direct Growth - ISIN: INF769K Registrar : CAMS',
    '01AB2(Advisor: ARN-28283)',
    'Nominee 1: JANE DOE Nominee 2: Nominee 3:',
    'Opening Unit Balance: 0.000',
    '01-Jan-2024 Purchase - BSE - 1,000.00 10.000 100.0000 10.000',
    'Closing Unit Balance: 10.000 NAV on 30-Jun-2024: INR 120.0000 Valuation on 30-Jun-2024: INR 1,200.00',
    'Total Cost Value: 1,000.00',
    'Folio No : 999 / 1',
    '128TSGPG-Axis Long Term Equity Fund - Direct Growth (Advisor: DIRECT)',
    '- ISIN: INF846K01EW2 Registrar : KFINTECH',
    'Opening Unit Balance: 5.000',
    'Closing Unit Balance: 5.000 NAV on 30-Jun-2024: INR 90.0000 Valuation on 30-Jun-2024: INR 450.00',
  ]

  it('stitches wrapped headers, completes a wrapped ISIN and ignores lines before the first folio', () => {
    expect(parseCasText(REAL)).toEqual([
      {
        name: 'Test Fund - Direct Growth',
        isin: 'INF769K01AB2',
        units: 10,
        navDate: '2024-06-30',
        cost: 1000,
        value: 1200,
        flows: [{ date: '2024-01-01', amount: 1000 }],
      },
      // The ISIN is on the line after the name; units already held at the start, so no full history
      { name: 'Axis Long Term Equity Fund - Direct Growth', isin: 'INF846K01EW2', units: 5, navDate: '2024-06-30', cost: null, value: 450, flows: null },
    ])
  })

  it("outlines an unreadable statement without the investor's details", () => {
    const outline = casOutline(REAL)
    expect(outline).toContain('T000-Test Fund - Direct Growth - ISIN: INF000K Registrar : CAMS')
    expect(outline).toContain('Closing Unit Balance: 00.000')
    expect(outline).toContain('Folio No : 00000 / 00 PAN: XXXXX0000X KYC : OK PAN : OK\n[other line]\nT000-Test Fund')
    for (const secret of ['Rose', 'ABCDE', 'JANE', 'JOHN', '12345', '1,200']) expect(outline).not.toContain(secret)
  })
})

describe('parseCasText on an NSDL/CDSL depository statement', () => {
  // The layout of the CAS that NSDL or CDSL send when you have a demat account (names and figures made up).
  const DEPOSITORY = [
    'FORM AND INVESTMENTS IN MUTUAL FUNDS',
    'Folio No : 910112345678/0 Mode of Holding : Single Email id : ravi@example.com',
    'D O Ravi Kumar A 101 Lake View Apartment CDSL/NSDL/Mutual Funds. We trust this initiative',
    'ISIN : INF846K01EW2 UCC : RTA : KFIN',
    'AMC Name : HDFC Mutual Fund',
    'Scheme Name : HDFC Balanced Advantage Fund - Regular Plan - Growth Scheme Code : GFG',
    'Folio No : 12345678/90 Mode of Holding : Single Email id : Please provide',
    'RAVI KUMAR',
    'ISIN : INF179K01830 UCC : MFHDFC1234 RTA : CAMS',
    'AMC Name : ICICI Prudential Mutual Fund',
    'Scheme Name : ICICI Prudential Medium Term Fund - Direct Plan -',
    'Scheme Code : 8018',
    'Growth',
    'Folio No : 87654321/12 Mode of Holding : Single Email id : ravi@example.com',
    'ISIN : INF109K016A6 UCC : RTA : CAMS',
    'STATEMENT OF TRANSACTIONS FOR THE PERIOD FROM 01-09-2026 TO 30-09-2026',
    'Axis Mutual Fund',
    'MTDG - Axis Multicap Fund Direct Growth',
    'ISIN : INF846K01EW2 UCC :',
    '05-09-2026 1/120 - via Internet - DIRECT 5000.00 15.21 15.21 328.731 .25 0 0',
    'MUTUAL FUND UNITS HELD AS ON 30-09-2026',
    'Scheme Name ISIN Folio No. ARN Code Bal NAV (`) Valuation (`) Distributors Profit/ Profit/',
    'Regular Direct terms - in (%)',
    'Axis Multicap INF846K01EW2 DIRECT 7958.120 15.21 1,10,000.00 1,21,043.01 0 .59 0 11,043.01 10.04',
    'Fund Direct Growth 123/4',
    'HDFC Balanced',
    'Advantage Fund - INF179K01830 12345678/90 ARN-0155 112.512 500.940 38,000.00 56,361.76 1.37 0 467.00 18,361.76 48.32',
    'Regular Plan - Growth',
    'Medium Term Fund - INF109K016A6 87654321/12 1004.950 40.9600 40,000.00 41,162.75 0 .70 0 1,162.75 2.91',
    'DIRECT',
  ]

  it('reads each holdings row, taking names from the scheme headings and the value that equals units × NAV', () => {
    const common = { navDate: '2026-09-30', flows: null }
    expect(parseCasText(DEPOSITORY)).toEqual([
      { name: 'Axis Multicap Fund Direct Growth', isin: 'INF846K01EW2', units: 7958.12, cost: 110000, value: 121043.01, ...common },
      { name: 'HDFC Balanced Advantage Fund - Regular Plan - Growth', isin: 'INF179K01830', units: 112.512, cost: 38000, value: 56361.76, ...common },
      // The scheme name wrapped around its "Scheme Code" line
      { name: 'ICICI Prudential Medium Term Fund - Direct Plan - Growth', isin: 'INF109K016A6', units: 1004.95, cost: 40000, value: 41162.75, ...common },
    ])
  })

  it('keeps names and addresses out of the outline even when a line mentions funds', () => {
    const outline = casOutline(DEPOSITORY)
    expect(outline).toContain('Scheme Name : HDFC Balanced Advantage Fund - Regular Plan - Growth Scheme Code : GFG')
    for (const secret of ['Ravi', 'RAVI', 'Lake View', 'ravi@']) expect(outline).not.toContain(secret)
  })
})

describe('matchHolding', () => {
  it('prefers the ISIN, then a close name, keeping Direct and Regular plans apart', () => {
    const fund = { name: 'HDFC Balanced Advantage Fund - Direct Plan - Growth Option', isin: 'INF179K01WA6', units: 1, navDate: null, cost: null, value: 1, flows: null }
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
      flows: [
        { date: '2026-01-01', amount: 65000 },
        { date: '2026-10-25', amount: 5000 },
      ],
    })
    const fund = { name: 'Axis Small Cap Fund - Direct Growth', isin: 'INF846K01K35', units: 657.39, navDate: '2026-10-23', cost: 64000, value: 69391, flows: null }
    const gold = { name: 'ICICI Prudential Gold ETF FOF', isin: 'INF109KC1NT3', units: 1500, navDate: '2026-10-23', cost: null, value: 45000, flows: null }
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
    // No history in the statement: Stash's own flows are kept, and the re-added instalment appears once, not twice
    expect(next.holdings[0].flows).toEqual([
      { date: '2026-01-01', amount: 65000 },
      { date: '2026-10-25', amount: 5000 },
    ])
    // A new fund without history starts from its statement value
    expect(next.holdings[1].flows).toEqual([{ date: '2026-10-23', amount: 45000 }])

    // With a full history in the statement, it replaces Stash's flows; later SIP instalments are still added
    const history = [{ date: '2024-11-25', amount: 64000 }]
    const withHistory = applyCasImport({ ...DEFAULT_DATA, holdings: [existing] }, [{ fund: { ...fund, flows: history }, action: { kind: 'update', holdingId: 'axis' } }], '2026-10-27')
    expect(withHistory.holdings[0].flows).toEqual([...history, { date: '2026-10-25', amount: 5000 }])

    // Tracked by Stash only since after the statement date: returns start from the statement's value
    const trackedLater = { ...existing, flows: [{ date: '2026-10-26', amount: 70000 }] }
    const rebased = applyCasImport({ ...DEFAULT_DATA, holdings: [trackedLater] }, [{ fund, action: { kind: 'update', holdingId: 'axis' } }], '2026-10-27')
    expect(rebased.holdings[0].flows).toEqual([
      { date: '2026-10-23', amount: 69391 },
      { date: '2026-10-25', amount: 5000 },
    ])
  })
})
