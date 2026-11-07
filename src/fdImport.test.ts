import { describe, expect, it } from 'vitest'
import { applyFdImport, fdOutline, maturityMismatch, parseFdText, paysOutInterest } from './fdImport'
import { DEFAULT_DATA, type FixedDeposit } from './types'

// Lines as pdf.js extracts them (names and numbers made up).
const HDFC_ADVICE = [
  'HDFC BANK LIMITED',
  'Fixed Deposit Advice',
  'Customer Name MS ANITA SHARMA Customer ID 12345678',
  'Deposit No. 50300123456789 Value Date 15/04/2026',
  'Principal Amount INR 2,00,000.00 Maturity Date 15/04/2027',
  'Rate of Interest 6.60% p.a. Maturity Amount INR 2,13,488.00',
  'Tenure 12 Months 0 Days Interest Payout Option Reinvestment',
  'Premature withdrawal attracts a penalty of 1% on the rate applicable from 01/01/2024.',
  'HDFC Bank Ltd, registered office',
]

// Labels in one row with their values below, as in an SBI e-receipt.
const SBI_RECEIPT = [
  'State Bank of India',
  'e-TDR / e-STDR Receipt',
  'Account Number Date of Deposit Deposit Amount Rate of Interest Maturity Date Maturity Value',
  '40123456789 05-Jun-2026 1,50,000.00 6.45 05-Jun-2028 1,70,546.00',
  'Nominee Registered: Yes',
]

const ICICI_SUMMARY = [
  'ICICI Bank',
  'Fixed Deposit Summary',
  'Deposit No. Principal Amount (INR) Interest Rate (%) Open Date Maturity Date Maturity Amount (INR)',
  '123405012345 1,00,000.00 7.10 10 Jan 2026 10 Jan 2027 1,07,292.00',
  '123405012346 50,000.00 6.70 01 Mar 2026 01 Sep 2027 50,000.00',
  'Total 1,50,000.00',
  'ICICI Bank Limited',
]

describe('parseFdText', () => {
  it('reads an HDFC advice with labels and values side by side, ignoring dates and rates in the small print', () => {
    expect(parseFdText(HDFC_ADVICE)).toEqual({
      bank: 'HDFC Bank',
      fds: [{ principal: 200000, rate: 6.6, startDate: '2026-04-15', maturityDate: '2027-04-15', maturityAmount: 213488 }],
      incomplete: 0,
    })
  })

  it('reads an SBI receipt whose values sit under a row of labels, without mistaking the account number for an amount', () => {
    expect(parseFdText(SBI_RECEIPT).fds).toEqual([{ principal: 150000, rate: 6.45, startDate: '2026-06-05', maturityDate: '2028-06-05', maturityAmount: 170546 }])
  })

  it('reads every FD in an ICICI summary table and spots one that pays out its interest', () => {
    const { bank, fds } = parseFdText(ICICI_SUMMARY)
    expect(bank).toBe('ICICI Bank')
    expect(fds).toEqual([
      { principal: 100000, rate: 7.1, startDate: '2026-01-10', maturityDate: '2027-01-10', maturityAmount: 107292 },
      { principal: 50000, rate: 6.7, startDate: '2026-03-01', maturityDate: '2027-09-01', maturityAmount: 50000 },
    ])
    expect(fds.map(paysOutInterest)).toEqual([false, true])
    // The printed maturity amounts agree with quarterly compounding, so nothing looks misread
    expect(fds.map(maturityMismatch)).toEqual([false, false])
  })

  it('reads an HDFC summary whose header is split over two lines and which names the bank only in its logo', () => {
    const summary = [
      'Fixed Deposit Summary',
      'Deposit Principal Maturity Maturity Rate of',
      'No Amount Amount Date Interest Start Date',
      '50300123456789 2,00,000.00 2,13,488.00 15 Apr 2027 6.60 15 Apr 2026',
      '50300987654321 1,00,000.00 1,00,000.00 01/01/2028 7.10 01/01/2026',
      '* The principal amount provided in the summary table above is dynamic.',
    ]
    expect(parseFdText(summary)).toEqual({
      bank: null,
      fds: [
        { principal: 200000, rate: 6.6, startDate: '2026-04-15', maturityDate: '2027-04-15', maturityAmount: 213488 },
        { principal: 100000, rate: 7.1, startDate: '2026-01-01', maturityDate: '2028-01-01', maturityAmount: 100000 },
      ],
      incomplete: 0,
    })
  })

  it('reads an HDFC netbanking summary whose cells wrap, putting the years on the next line', () => {
    // The layout of a real HDFC "FD Summary" PDF, from its privacy-safe outline
    const summary = [
      'Fixed Deposit Summary',
      'Sr Account No. Branch Name Currency Principal Maturity Maturity Rate of Deposit',
      'No Amount Amount Date Interest Start Date',
      '1 50300123456789 MUMBAI - NARIMAN POINT (MAIN INR 200000.00 206636.00 15 Jun 6.60 15 Dec',
      'BRANCH), 2027 2026',
      '2 50300987654321 PUNE - BANER ROAD (BANER INR 50000.00 55551.00 10 Aug 7.10 10 Feb',
      '), 2027 2026',
      '3 50300987654322 PUNE - BANER ROAD (BANER INR 50000.00 55551.00 10 Aug 7.10 10 Feb',
      '), 2027 2026',
      'Total 300,000.00 317,738.00',
      '* The principal amount provided in the summary table above is dynamic.',
    ]
    const fds = parseFdText(summary).fds
    expect(fds).toEqual([
      { principal: 200000, rate: 6.6, startDate: '2026-12-15', maturityDate: '2027-06-15', maturityAmount: 206636 },
      // Two identical FDs opened the same day are both kept
      { principal: 50000, rate: 7.1, startDate: '2026-02-10', maturityDate: '2027-08-10', maturityAmount: 55551 },
      { principal: 50000, rate: 7.1, startDate: '2026-02-10', maturityDate: '2027-08-10', maturityAmount: 55551 },
    ])
    expect(fds.map(maturityMismatch)).toEqual([false, false, false])
  })

  it('reads an ICICI account summary, working out start dates it does not print', () => {
    // The layout of a real ICICI "Account Summary" PDF, from its privacy-safe outline: balance (the principal),
    // maturity amount and interest without commas or decimals, maturity date, rate, type and auto renewal.
    const summary = [
      'ICICI Bank ACCOUNT SUMMARY',
      'Fixed Deposit Balance Maturity Amount Accrued Interest Currency Maturity Date Interest Rate(Per Fixed Deposit Auto Renewal',
      'Number annum) Type',
      '123405012345 100000 107291 6,120 INR Feb 10, 2027 7.1% Regular Deposit N',
      '123405012346 250000 267701 17,701 INR Nov 20, 2026 6.9% Linked Fixed Y',
      'Deposit',
      '123405012347 45000.50 50126.00 1,234 INR Dec 05, 2027 7.25% Regular Deposit N',
      '123405012348 80000 80000 2,000 INR Mar 01, 2027 7.0% Regular Deposit Y',
      // A misread row (a 444-day tenure taken for the principal) would need a 35-year FD, so it's left out too
      '123405012349 444 4409 3,965 INR Feb 07, 2027 6.6% Regular Deposit N',
    ]
    const result = parseFdText(summary)
    expect(result.bank).toBe('ICICI Bank')
    expect(result.fds).toEqual([
      { principal: 100000, rate: 7.1, startDate: '2026-02-10', maturityDate: '2027-02-10', maturityAmount: 107291, startEstimated: true },
      { principal: 250000, rate: 6.9, startDate: '2025-11-20', maturityDate: '2026-11-20', maturityAmount: 267701, startEstimated: true },
      { principal: 45000.5, rate: 7.25, startDate: '2026-06-05', maturityDate: '2027-12-05', maturityAmount: 50126, startEstimated: true },
    ])
    // One pays its interest out, so its start can't be worked out
    expect(result.incomplete).toBe(2)
  })

  it('reads an SBI deposits list, using the tenure for the start date and ignoring branch codes', () => {
    // The layout of a real SBI deposits PDF, from its privacy-safe outline
    const list = [
      'State Bank of India',
      'Deposits',
      'Account Number Account Type Branch Code of Branch Maturity Date Tenor ROI (%) Deposit Amt Maturity Value',
      '40123456789 AMRIT VRISHTI 04409 BANER 07-02-2027 444 days 6.60 1,00,000.00 1,08,289.00',
      '40123456790 REGULAR TDR 04163 AUNDH 14-02-2027 457 days 6.25 2,50,000.00 2,70,186.00',
      'Account Number Account Type Branch Tenor ROI (%) Deposit Amt Current/Withdrawable Amount',
      '40123456791 MULTI OPTION 04409 60 Months 6.50 12,00,000.00 12,40,000.00',
    ]
    expect(parseFdText(list)).toEqual({
      bank: 'SBI',
      fds: [
        { principal: 100000, rate: 6.6, startDate: '2025-11-20', maturityDate: '2027-02-07', maturityAmount: 108289 },
        { principal: 250000, rate: 6.25, startDate: '2025-11-14', maturityDate: '2027-02-14', maturityAmount: 270186 },
      ],
      incomplete: 0,
    })
  })

  it('finds nothing in a document without FDs', () => {
    expect(parseFdText(['HDFC Bank', 'Savings account statement', '01/10/2026 UPI-SWIGGY 450.00 12,000.00']).fds).toEqual([])
  })

  it('outlines a document keeping its shape but no names, addresses, IDs or digits', () => {
    const outline = fdOutline(HDFC_ADVICE)
    expect(outline).toContain('Principal Amount INR 0,00,000.00 Maturity Date 00/00/0000')
    expect(outline).toContain('Customer Name x x x Customer ID 00000000')
    expect(outline.split('\n').slice(1).join('\n')).not.toMatch(/ANITA|SHARMA|[1-9]/)
  })
})

describe('applyFdImport', () => {
  const fd = (id: string, bank: string, principal: number, extra: Partial<FixedDeposit> = {}): FixedDeposit => ({
    id,
    bank,
    principal,
    rate: 7,
    startDate: '2026-01-10',
    maturityDate: '2027-01-10',
    ...extra,
  })

  it('updates matching FDs, adds new ones and removes the chosen ones, leaving other banks alone', () => {
    const data = { ...DEFAULT_DATA, fds: [fd('a', 'icici', 100000, { rate: 6.9, emergency: true }), fd('b', 'ICICI', 75000), fd('c', 'SBI', 100000)] }
    const fds = parseFdText(ICICI_SUMMARY).fds.map((f) => ({ ...f, bank: 'ICICI Bank' as const }))
    const result = applyFdImport(data, fds, ['b']).fds
    expect(result).toHaveLength(3)
    // Same bank, amount and dates: the rate is corrected and the emergency fund switch and name are kept
    expect(result[0]).toEqual({ ...data.fds[0], rate: 7.1 })
    expect(result[1]).toBe(data.fds[2])
    expect(result[2]).toMatchObject({ bank: 'ICICI Bank', principal: 50000, startDate: '2026-03-01' })
  })

  it('pairs identical FDs one to one, so a second identical FD is added rather than updating the same one twice', () => {
    const one = { bank: 'HDFC Bank' as const, principal: 50000, rate: 7.1, startDate: '2026-02-10', maturityDate: '2027-08-10', maturityAmount: null }
    const data = { ...DEFAULT_DATA, fds: [fd('a', 'HDFC', 50000, { rate: 7, startDate: '2026-02-10', maturityDate: '2027-08-10' })] }
    const result = applyFdImport(data, [one, one], []).fds
    expect(result.map((f) => [f.id === 'a', f.rate])).toEqual([[true, 7.1], [false, 7.1]])
  })
})
