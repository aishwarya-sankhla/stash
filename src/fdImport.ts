import { fdValue, isoDate } from './finance'
import { newId } from './format'
import type { AppData, FixedDeposit } from './types'

/** The banks whose FD documents Stash reads: deposit advices / e-receipts (one FD) and FD summaries (a table of FDs). */
export const FD_BANKS = ['HDFC Bank', 'SBI', 'ICICI Bank'] as const
export type FdBank = (typeof FD_BANKS)[number]

export interface ImportedFd {
  bank: FdBank
  principal: number
  rate: number
  startDate: string
  maturityDate: string
  /** As printed, when the document shows it. */
  maturityAmount: number | null
  /** Set when the document has no start date, so it was worked out from the amounts, rate and maturity date. */
  startEstimated?: boolean
}
/** An FD as read from a document, before its bank is known (from the document, or else chosen by you). */
export type ParsedFd = Omit<ImportedFd, 'bank'>

/** Groups bank names as people type them ("hdfc", "State Bank of India") so imports replace the right FDs. */
export function bankKey(name: string): string {
  if (/hdfc/i.test(name)) return 'HDFC Bank'
  if (/icici/i.test(name)) return 'ICICI Bank'
  if (/\bsbi\b|state\s*bank/i.test(name)) return 'SBI'
  return name.trim().toLowerCase()
}

/** The bank the document is from: whichever of the three it names most often. */
export function detectBank(lines: string[]): FdBank | null {
  const text = lines.join('\n')
  const counts = FD_BANKS.map((bank) => {
    const pattern = { 'HDFC Bank': /hdfc\s*bank/gi, SBI: /state\s*bank\s*of\s*india|\bsbi\b/gi, 'ICICI Bank': /icici\s*bank/gi }[bank]
    return { bank, n: text.match(pattern)?.length ?? 0 }
  }).sort((a, b) => b.n - a.n)
  return counts[0].n > 0 ? counts[0].bank : null
}

// --- Values ------------------------------------------------------------------
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MON = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?'
const DATE = new RegExp(
  [`\\b(\\d{4})-(\\d{2})-(\\d{2})\\b`, `\\b(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{4}|\\d{2})\\b`, `\\b(\\d{1,2})[ -]?${MON}(?:[ ,-]*(\\d{4})|-(\\d{2}))\\b`, `\\b${MON} (\\d{1,2}),? (\\d{4})\\b`].join('|'),
  'gi',
)
const AMOUNT = /(?:₹|\bRs\.?|\bINR)\s{0,2}(\d[\d,]*(?:\.\d+)?)|\b(\d{1,3}(?:,\d{2})*,\d{3}(?:\.\d{1,2})?)(?![\d,])|\b(\d{3,9}\.\d{2})(?!\d)/gi
// Not a tenure such as "444 days".
const PLAIN_AMOUNT = /(?<![\d,.])\b(\d{3,9})(?![\d.,])(?!\s*(?:days?|months?|years?|yrs?)\b)/gi
const TENURE = /\b(\d{1,4})\s*(days?|months?|years?|yrs?)\b/i
const RATE = /\b(\d{1,2}(?:\.\d{1,3})?)\s*%|\b(\d{1,2}\.\d{1,3})(?![\d,%])/g

function isoFromMatch(m: RegExpExecArray): string | null {
  let y: number, mo: number, d: number
  if (m[1]) [y, mo, d] = [+m[1], +m[2], +m[3]]
  else if (m[4]) [d, mo, y] = [+m[4], +m[5], +m[6]]
  else if (m[7]) [d, mo, y] = [+m[7], MONTHS.indexOf(m[8].slice(0, 3).toLowerCase()) + 1, +(m[9] ?? m[10])]
  else [mo, d, y] = [MONTHS.indexOf(m[11].slice(0, 3).toLowerCase()) + 1, +m[12], +m[13]]
  if (y < 100) y += 2000
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

type Kind = 'date' | 'amount' | 'rate' | 'none'
const num = (s: string) => Number(s.replace(/,/g, ''))

/**
 * Values of one kind in a piece of text, in order. Dates are taken out before amounts and rates are looked for.
 * Amounts without commas or decimals ("100000") count only when `plain` says so: as a fallback right after an
 * amount label, or always in a table row.
 */
function valuesIn(text: string, kind: Kind, plain?: 'fallback' | 'always'): number[] | string[] {
  const dates: string[] = []
  const rest = text.replace(DATE, (...args) => {
    const iso = isoFromMatch(args.slice(0, -2) as unknown as RegExpExecArray)
    if (iso) dates.push(iso)
    return ' '.repeat(args[0].length)
  })
  if (kind === 'date') return dates
  if (kind === 'none') return []
  if (kind === 'amount') {
    const formatted = [...rest.matchAll(AMOUNT)]
    const plainOnes = plain === 'always' || (plain === 'fallback' && formatted.length === 0) ? [...rest.matchAll(PLAIN_AMOUNT)] : []
    return [...formatted, ...plainOnes]
      .sort((a, b) => a.index! - b.index!)
      .map((m) => num(m[1] ?? m[2] ?? m[3]))
      .filter((v) => v >= 100)
  }
  const withoutAmounts = rest.replace(AMOUNT, (s) => ' '.repeat(s.length))
  return [...withoutAmounts.matchAll(RATE)].map((m) => num(m[1] ?? m[2])).filter((v) => v > 0 && v <= 20)
}

// --- Labels --------------------------------------------------------------------
type Field = 'principal' | 'balance' | 'amount' | 'rate' | 'startDate' | 'maturityDate' | 'maturityAmount' | 'other'
const LABELS: { field: Field; kind: Kind; pattern: RegExp }[] = [
  { field: 'maturityAmount', kind: 'amount', pattern: /maturity\s*(?:amount|value|amt|proceeds)|amount\s*(?:on|at|payable\s*on)\s*maturity/i },
  { field: 'maturityDate', kind: 'date', pattern: /maturity\s*date|date\s*of\s*maturity|due\s*date|matur(?:es|ing)\s*on/i },
  { field: 'principal', kind: 'amount', pattern: /principal(?:\s*amount|\s*amt)?|deposit\s*amount|amount\s*of\s*deposit|amount\s*deposited|(?:fd|td|term\s*deposit)\s*amount|deposit\s*value/i },
  { field: 'rate', kind: 'rate', pattern: /rate\s*of\s*interest|interest\s*rate|\broi\b|int(?:erest)?\.?\s*rate|\brate\b/i },
  {
    field: 'startDate',
    kind: 'date',
    pattern: /value\s*date|date\s*of\s*(?:deposit|opening|issue|booking)|deposit\s*date|start\s*date|open(?:ing|ed)?\s*(?:on|date)|issue\s*date|effective\s*date|booking\s*date|from\s*date/i,
  },
  // A summary without a principal column (ICICI) shows it as the balance.
  { field: 'balance', kind: 'amount', pattern: /\bbalance\b/i },
  // Not read, but they end the label before them so its value isn't taken from the next column, and amount columns keep their order.
  { field: 'other', kind: 'amount', pattern: /interest\s*(?:amount|earned|payable|paid)|\btds\b/i },
  { field: 'other', kind: 'none', pattern: /tenure|period|deposit\s*(?:no|number)|a\/c|account|customer|branch/i },
  // A plain "Amt" column (SBI's deposit amount), used as the principal when no column is named so.
  { field: 'amount', kind: 'amount', pattern: /\b(?:amt|amount)\b/i },
]

interface Hit {
  field: Field
  kind: Kind
  start: number
  end: number
}

/** Every label on a line, left to right, without overlaps. */
function labelsIn(line: string): Hit[] {
  const hits: Hit[] = []
  for (const { field, kind, pattern } of LABELS) {
    for (const m of line.matchAll(new RegExp(pattern.source, 'gi'))) {
      const start = m.index!
      const end = start + m[0].length
      if (!hits.some((h) => start < h.end && end > h.start)) hits.push({ field, kind, start, end })
    }
  }
  return hits.sort((a, b) => a.start - b.start)
}

const MAX_TENURE_DAYS = 3660
const TABLE_FIELDS: Field[] = ['principal', 'balance', 'rate', 'startDate', 'maturityDate', 'maturityAmount']

/**
 * Checks a candidate FD. Without a start date (ICICI's summary has none), the start is worked out from how
 * long the principal takes to grow into the maturity amount at the rate, compounded quarterly.
 */
function finish(fd: Partial<Record<Field, number | string>>): ParsedFd | null {
  const { principal, rate, maturityDate } = fd as { principal?: number; rate?: number; maturityDate?: string }
  const maturityAmount = typeof fd.maturityAmount === 'number' ? fd.maturityAmount : null
  let startDate = fd.startDate as string | undefined
  let startEstimated = false
  if (!startDate && principal && rate && maturityDate && maturityAmount && maturityAmount > principal * 1.001) {
    const days = Math.round((365 * Math.log(maturityAmount / principal)) / (4 * Math.log(1 + rate / 400)))
    // Banks' FDs run for at most 10 years; a longer one means the numbers were misread.
    if (days <= MAX_TENURE_DAYS) {
      const [y, m, d] = maturityDate.split('-').map(Number)
      startDate = isoDate(new Date(y, m - 1, d - days))
      startEstimated = true
    }
  }
  if (!principal || principal < 100 || !rate || rate > 20 || !startDate || !maturityDate || maturityDate <= startDate) return null
  return { principal, rate, startDate, maturityDate, maturityAmount, ...(startEstimated ? { startEstimated } : {}) }
}

/**
 * A summary table: a header line naming the maturity date and at least two other fields, then one line per
 * FD (a cell may wrap onto the line below). Each FD line's values are matched to the header by order within
 * their kind (the second date under the second date column). `incomplete` counts FD lines that couldn't be
 * read fully, such as an FD paying out its interest in a summary without start dates.
 */
function parseTable(lines: string[], incomplete = { rows: 0 }): ParsedFd[] {
  const fds: ParsedFd[] = []
  for (let i = 0; i < lines.length; i++) {
    const header = labelsIn(lines[i])
    const fields = new Set(header.map((h) => h.field))
    if (!fields.has('maturityDate') || TABLE_FIELDS.filter((f) => fields.has(f)).length < 3) continue
    // A header line has the labels but not their values.
    if (valuesIn(lines[i], 'date').length > 0 || valuesIn(lines[i], 'amount').length > 0) continue
    const columns = (kind: Kind) => header.filter((h) => h.kind === kind && h.field !== 'other').map((h) => h.field)
    const byKind = { date: columns('date'), amount: header.filter((h) => h.kind === 'amount').map((h) => h.field) }
    let lastRow = i
    for (let j = i + 1; j < lines.length; j++) {
      const row = lines[j]
      const dates = valuesIn(row, 'date') as string[]
      // Amounts with commas or decimals when there are enough of them for the amount columns; plain numbers
      // otherwise (ICICI prints "100000"), as plain numbers can also be branch codes (SBI).
      const formatted = valuesIn(row, 'amount') as number[]
      const amounts = formatted.length >= byKind.amount.length ? formatted : (valuesIn(row, 'amount', 'always') as number[])
      if (dates.length === 0 || amounts.length === 0) {
        // FD lines follow the header, with wrapped cells between them; stop at the end of the table.
        if (j - lastRow > 3 || labelsIn(row).length >= 3) break
        continue
      }
      lastRow = j
      const fd: Partial<Record<Field, number | string>> = {}
      dates.forEach((v, k) => byKind.date[k] && (fd[byKind.date[k]] ??= v))
      amounts.forEach((v, k) => byKind.amount[k] && (fd[byKind.amount[k]] ??= v))
      const rates = valuesIn(row, 'rate') as number[]
      if (rates.length > 0) fd.rate = rates[0]
      if (dates.length >= 2) {
        fd.startDate ??= dates[0]
        fd.maturityDate ??= dates.at(-1)
      } else fd.maturityDate ??= dates[0]
      // A tenure such as "444 days" gives the start date exactly.
      const tenure = row.match(TENURE)
      if (!fd.startDate && tenure && typeof fd.maturityDate === 'string') {
        const [y, m, d] = fd.maturityDate.split('-').map(Number)
        const n = Number(tenure[1])
        const unit = tenure[2].toLowerCase()
        fd.startDate = isoDate(unit.startsWith('d') ? new Date(y, m - 1, d - n) : unit.startsWith('m') ? new Date(y, m - 1 - n, d) : new Date(y - n, m - 1, d))
      }
      fd.principal ??= fd.balance ?? fd.amount ?? Math.min(...amounts)
      const found = finish(fd)
      if (found) fds.push(found)
      else incomplete.rows++
    }
  }
  return fds
}

/**
 * Advices and e-receipts: "Label value" pairs, the value on the same line after its label or, when a row of
 * labels sits above a row of values, in the same position on the next line. A document with several advices
 * gives several values per label, read in order.
 */
function parseLabelled(lines: string[]): ParsedFd[] {
  const found: Record<Field, (number | string)[]> = { principal: [], balance: [], amount: [], rate: [], startDate: [], maturityDate: [], maturityAmount: [], other: [] }
  lines.forEach((line, i) => {
    const hits = labelsIn(line)
    hits.forEach((hit, h) => {
      if (hit.field === 'other') return
      const segment = line.slice(hit.end, hits[h + 1]?.start ?? line.length)
      const inline = valuesIn(segment, hit.kind, 'fallback')
      if (inline.length > 0) return found[hit.field].push(inline[0])
      // Labels in a row with their values below: take the value in the same position among the same kind.
      const position = hits.slice(0, h).filter((x) => x.kind === hit.kind).length
      for (const next of lines.slice(i + 1, i + 3)) {
        const below = valuesIn(next, hit.kind, 'fallback')
        if (below.length === 0) continue
        const value = below.length === hits.filter((x) => x.kind === hit.kind).length ? below[position] : below[0]
        if (value !== undefined) found[hit.field].push(value)
        break
      }
    })
  })
  // One principal means one FD: take each field's first value, as terms and conditions further down can
  // mention rates and dates too. Several principals are several advices in one file, read in order.
  const n = found.principal.length
  const fds: ParsedFd[] = []
  for (let k = 0; k < n; k++) {
    const fd = finish(Object.fromEntries((Object.keys(found) as Field[]).map((f) => [f, found[f][n === 1 ? 0 : k]])))
    if (fd && !fds.some((x) => sameFd(x, fd))) fds.push(fd)
  }
  return fds
}

/** Same amount and maturity date. The start date isn't compared, as it's sometimes worked out rather than printed. */
const sameFd = (a: Pick<ImportedFd, 'principal' | 'maturityDate'>, b: Pick<ImportedFd, 'principal' | 'maturityDate'>) =>
  Math.abs(a.principal - b.principal) < 1 && a.maturityDate === b.maturityDate

/**
 * FD lines without a usable header (one split over several lines, say): each line with two dates, an amount
 * and a rate is an FD. The earlier date is the start and the later the maturity; the principal is the amount
 * that grows into another amount on the line at that rate (the maturity amount), or else the smallest.
 */
function parseRows(lines: string[]): ParsedFd[] {
  const fds: ParsedFd[] = []
  for (const line of lines) {
    const dates = (valuesIn(line, 'date') as string[]).sort()
    const amounts = valuesIn(line, 'amount') as number[]
    const rate = (valuesIn(line, 'rate') as number[])[0]
    if (dates.length < 2 || amounts.length === 0 || rate === undefined) continue
    const [startDate, maturityDate] = [dates[0], dates.at(-1)!]
    const grows = (p: number, m: number) => Math.abs(fdValue({ id: '', bank: '', principal: p, rate, startDate, maturityDate }, maturityDate) - m) <= m * 0.02
    const pair =
      amounts.flatMap((p, i) => amounts.filter((_, j) => j !== i && grows(p, amounts[j])).map((m) => [p, m]))[0] ??
      amounts.flatMap((p, i) => amounts.filter((m, j) => j !== i && Math.abs(m - p) < 1).map((m) => [p, m]))[0] // interest paid out
    const fd = finish({ principal: pair?.[0] ?? Math.min(...amounts), maturityAmount: pair?.[1], rate, startDate, maturityDate })
    if (fd) fds.push(fd) // two identical FDs on one summary are two FDs
  }
  return fds
}

/** "15 Jun" without its year, which a wrapped table cell puts on the next line. */
const PARTIAL_DATE = new RegExp(`\\b\\d{1,2}[ -]${MON}(?![a-z])(?![ ,-]*\\d{4}\\b|-\\d{2}\\b)`, 'gi')
const YEAR = /\b(?:19|20)\d{2}\b/g

/**
 * Puts back years that wrapped onto the next line: "… 15 Jun 6.60 15 Dec" above "BRANCH), 2027 2026"
 * becomes "… 15 Jun 2027 6.60 15 Dec 2026", when the next line has one year for each date missing one.
 */
function joinWrappedYears(lines: string[]): string[] {
  const out = [...lines]
  for (let i = 0; i + 1 < out.length; i++) {
    const partial = out[i].match(PARTIAL_DATE)
    const years = out[i + 1].match(YEAR)
    if (!partial || years?.length !== partial.length) continue
    let k = 0
    out[i] = out[i].replace(PARTIAL_DATE, (d) => `${d} ${years[k++]}`)
    out[i + 1] = out[i + 1].replace(YEAR, '')
  }
  return out
}

/**
 * Reads the FDs in a deposit advice, e-receipt or FD summary, and which of HDFC Bank, SBI or ICICI Bank it's
 * from (null when the document doesn't say in its text, for example when the name is only in the logo).
 */
export function parseFdText(text: string[]): { bank: FdBank | null; fds: ParsedFd[]; incomplete: number } {
  const bank = detectBank(text)
  const lines = joinWrappedYears(text)
  const incomplete = { rows: 0 }
  const table = parseTable(lines, incomplete)
  if (table.length > 0) return { bank, fds: table, incomplete: incomplete.rows }
  for (const parse of [parseRows, parseLabelled]) {
    const fds = parse(lines)
    if (fds.length > 0) return { bank, fds, incomplete: 0 }
  }
  return { bank, fds: [], incomplete: incomplete.rows }
}

/** True when the printed maturity amount is the principal: interest is paid out, not reinvested. */
export const paysOutInterest = (fd: ParsedFd) => fd.maturityAmount !== null && Math.abs(fd.maturityAmount - fd.principal) < fd.principal * 0.005

/** True when the printed maturity amount is far from what Stash's quarterly-compounding sum gives, so the numbers may be misread. */
export const maturityMismatch = (fd: ParsedFd) =>
  fd.maturityAmount !== null && !paysOutInterest(fd) && Math.abs(fdValue({ ...fd, id: '', bank: '' }, fd.maturityDate) - fd.maturityAmount) > fd.maturityAmount * 0.02

/** The existing FD each imported one replaces: same bank, amount and dates, each existing FD used once. */
export function pairFds(imported: ImportedFd[], existing: FixedDeposit[]): (FixedDeposit | undefined)[] {
  const used = new Set<string>()
  return imported.map((fd) => {
    const match = existing.find((f) => !used.has(f.id) && bankKey(f.bank) === fd.bank && sameFd(f, fd))
    if (match) used.add(match.id)
    return match
  })
}

/**
 * Replaces the FDs of the imported banks with the imported ones: matching FDs are updated (keeping their
 * emergency fund switch), new ones added, and the ids in `remove` (FDs of those banks not in the files) deleted.
 */
export function applyFdImport(data: AppData, imported: ImportedFd[], remove: string[]): AppData {
  const fds = data.fds.filter((f) => !remove.includes(f.id))
  pairFds(imported, fds).forEach((match, i) => {
    const fd = imported[i]
    const next = { ...match, id: match?.id ?? newId(), bank: match?.bank ?? fd.bank, principal: fd.principal, rate: fd.rate, startDate: fd.startDate, maturityDate: fd.maturityDate }
    if (match) fds[fds.indexOf(match)] = next
    else fds.push(next)
  })
  return { ...data, fds }
}

/**
 * A privacy-safe outline of a document Stash couldn't read, for reporting it. Every line keeps its shape, but
 * digits become 0 and every word that isn't a common banking word or a month becomes "x", so names,
 * addresses and IDs can't show. Lines before the first one about deposits are left out.
 */
export function fdOutline(lines: string[]): string {
  const known = new Set(
    `fixed deposit deposits summary advice receipt e-receipt term principal amount amt maturity mature value date dates rate rates of interest roi int
    start open opening opened issue booking effective from to on at in for the and or a an no number nos acc account a/c tenure period months month days day years year
    payout reinvestment reinvest cumulative quarterly monthly yearly total balance current tds nomination nominee name customer id branch status type scheme
    renewal auto renew sweep p.a linked lien yes y n inr rs p.a. pa annum per % hdfc bank icici sbi state india ltd limited bank's details deposit's
    jan feb mar apr may jun jul aug sep sept oct nov dec january february march april june july august september october november december
    is above below provided table dynamic incase case has have triggered part liquidated his her recovered shall change payable paid earned net gross`.split(/\s+/),
  )
  const mask = (line: string) =>
    line
      .replace(/\d/g, '0')
      .split(/(\s+|[():,|*/-])/)
      .map((w) => (/[A-Za-z\u0900-\u097F]/.test(w) && !known.has(w.toLowerCase().replace(/[.:]+$/, '')) ? 'x' : w))
      .join('')
  const first = Math.max(0, lines.findIndex((line) => /deposit|principal|maturity|\bfd\b/i.test(line)))
  return [`${lines.length} lines; digits as 0 and other words as x:`, ...lines.slice(first, first + 120).map(mask)].join('\n')
}
