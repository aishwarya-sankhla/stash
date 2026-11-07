import { applySips, sipCoveredMonth } from './finance'
import { newId } from './format'
import type { AppData, Flow, Holding } from './types'

/**
 * Reads the text of a CAMS / KFintech Consolidated Account Statement (the detailed CAS you can request
 * free from either registrar). Each fund block names the scheme with its ISIN and ends with a line like:
 *   Closing Unit Balance: 657.390 NAV on 23-Oct-2026: INR 105.5560 Total Cost Value: 64,000.00 Market Value on 23-Oct-2026: INR 69,391.13
 */
export interface CasFund {
  name: string
  isin: string | null
  units: number
  navDate: string | null // YYYY-MM-DD
  /** Purchase cost of the units still held; null when the statement doesn't show it. */
  cost: number | null
  value: number
  /**
   * Every purchase (+) and redemption (−) since the first one, for working out the yearly return. Null when
   * the statement doesn't cover the fund's whole history (it opens with units already held) or when the
   * transactions found don't add up to the closing units, so a missed line can't skew the return.
   */
  flows: Flow[] | null
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
const DATE = String.raw`(\d{1,2}-[A-Za-z]{3}-\d{4})`
const AMOUNT = String.raw`(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)`

function toIso(date: string): string | null {
  const [d, mon, y] = date.split('-')
  const m = MONTHS[mon.toLowerCase()]
  return m ? `${y}-${m}-${d.padStart(2, '0')}` : null
}

const num = (s: string) => Number(s.replace(/,/g, ''))
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

/** "B205DGG-Axis Small Cap Fund - Direct Growth - " → "Axis Small Cap Fund - Direct Growth" */
function cleanName(text: string): string {
  return text
    .replace(/^[A-Z0-9]{3,12}-(?=\S)/, '') // registrar's scheme code
    .replace(/\((?:Non-Demat|Demat)\)/gi, '')
    .replace(/\(formerly[^)]*\)/gi, '')
    .replace(/\(Advisor\s*:[^)]*\)/gi, '')
    .replace(/Registrar\s*:.*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s-]+$/, '')
    .trim()
}

/** Figures at the end of a transaction line; redemptions show negative amounts and units, in brackets or with a minus. */
const FIGURE = /^\(?-?[\d,]+\.\d+\)?$/
const figure = (token: string) => (token.startsWith('(') || token.startsWith('-') ? -1 : 1) * num(token.replace(/[()-]/g, ''))

/**
 * A transaction line: "05-Oct-2026 Purchase - Systematic Investment 4,999.75 47.393 105.5000 657.390"
 * (amount, units, NAV, unit balance), or a one-figure charge line such as "05-Oct-2026 *** Stamp Duty *** 0.25".
 */
function parseTransaction(line: string): { flow: Flow; units: number } | null {
  const match = new RegExp(String.raw`^${DATE}\s+(.*)$`).exec(line.trim())
  const date = match && toIso(match[1])
  if (!match || !date) return null
  const tokens = match[2].split(/\s+/)
  let count = 0
  while (count < tokens.length && FIGURE.test(tokens[tokens.length - 1 - count])) count++
  const figures = tokens.slice(tokens.length - count).map(figure)
  if (count >= 4) {
    const [amount, units] = figures.slice(-4)
    const sign = amount < 0 || units < 0 ? -1 : 1
    return { flow: { date, amount: round(sign * Math.abs(amount), 2) }, units: round(sign * Math.abs(units), 4) }
  }
  // Stamp duty is paid on top of each purchase, so it is part of the money you put in.
  if (count === 1 && /stamp\s*duty/i.test(match[2])) return { flow: { date, amount: figures[0] }, units: 0 }
  return null
}

// A fund's header: "<registrar code>-<scheme name> - ISIN: <isin>(Advisor: …) Registrar : CAMS". On real
// statements it wraps unpredictably: the ISIN or advisor code can land on the next line, even behind the
// "Registrar :" label, and a holder-name line can sit between the folio line and the scheme line. So the
// header lines between the folio and the opening balance are stitched together before reading them.
/** "B205DGG-…", "127 CPGPG-…": alphanumeric code with a letter in it, dash glued on (not "01-Jan-2026" or "Entry Load - NIL"). */
const SCHEME_CODE = /^\s*(?=[A-Z0-9 ]{0,40}[A-Z])[A-Z0-9]+(?: [A-Z0-9]+)*-/i
const HEADER_MARKER = /Registrar\s*:|Advisor\s*:|ISIN\s*:|\bARN-?\d+\b|\bINA\d+\b|\b(?:CAMS|KFINTECH|KFIN|KARVY)\b/i
const DANGLING_MARKER = /(?:Registrar\s*:|Advisor\s*:|ISIN\s*:)\s*$/i
const FULL_ISIN = /^INF[0-9A-Z]{8}\d$/
const ISIN_ANYWHERE = /\bINF[0-9A-Z]{8}\d\b/
const NAME_END = /\(\s*Advisor\s*:|Registrar\s*:?|Nominee\s+\d|\bARN-?\d+\b|\bINA\d+\b|\b(?:CAMS|KFINTECH|KFIN|KARVY)\b/i

const isSchemeLine = (line: string) => SCHEME_CODE.test(line) && line.split('-')[0].trim().toUpperCase() !== 'ARN'

/** The scheme name and ISIN from the lines between a folio line and the fund's opening balance. */
export function parseSchemeHeader(region: string[]): { name: string; isin: string | null } | null {
  let start = region.findIndex(isSchemeLine)
  if (start < 0) start = region.findIndex((line) => /ISIN\s*:/i.test(line))
  if (start < 0) return null
  // The scheme line, plus later lines that carry header markers or finish a value left dangling.
  const members = [region[start]]
  let dangling = DANGLING_MARKER.test(region[start]) || /\(\s*Advisor\s*:[^)]*$/i.test(region[start])
  for (const line of region.slice(start + 1)) {
    if (dangling || HEADER_MARKER.test(line)) {
      members.push(line)
      dangling = DANGLING_MARKER.test(line) || /\(\s*Advisor\s*:[^)]*$/i.test(line)
    }
  }
  const header = members.join(' ').replace(/\s+/g, ' ')

  let isin: string | null = null
  const labelled = /ISIN\s*:\s*([A-Z0-9]*)/i.exec(header)
  const partial = labelled?.[1].toUpperCase() ?? ''
  if (FULL_ISIN.test(partial)) isin = partial
  else isin = ISIN_ANYWHERE.exec(header.toUpperCase())?.[0] ?? null
  if (!isin && labelled && partial.startsWith('INF')) {
    // The rest of a wrapped ISIN is a later token: "ISIN: INF769K Registrar : CAMS 01AB2".
    const rest = header.slice(labelled.index + labelled[0].length).toUpperCase().match(/[A-Z0-9]+/g) ?? []
    isin = rest.map((t) => partial + t).find((candidate) => FULL_ISIN.test(candidate)) ?? null
  }

  // Remove annotations spliced into the name, then cut at whatever ends it.
  let text = header.replace(/[-\s]*\(\s*Advisor\s*:[^)]*\)/gi, ' ').replace(/[-\s]*ISIN\s*:\s*[A-Z0-9]*/gi, ' ')
  const end = NAME_END.exec(text)
  if (end) text = text.slice(0, end.index)
  const name = cleanName(text)
  return name ? { name, isin } : null
}

/** Reads the detailed CAS from CAMS or KFintech. */
function parseCamsText(lines: string[]): CasFund[] {
  const funds = new Map<string, CasFund>()
  let region: string[] = [] // lines since the last folio line or fund, holding the next fund's header
  let header: { name: string; isin: string | null } | null = null
  let opening = 0
  let flows: Flow[] = []
  let unitsBought = 0
  const startFund = (headerText: string[]) => {
    header = parseSchemeHeader(headerText)
    opening = 0
    flows = []
    unitsBought = 0
  }
  lines.forEach((line, i) => {
    if (/Folio\s+No\s*:/i.test(line)) {
      region = []
      header = null
      return
    }
    const openingMatch = /Opening\s+Unit\s+Balance\s*:?\s*([\d,]+(?:\.\d+)?)/i.exec(line)
    const transaction = parseTransaction(line)
    const closing = /Closing\s+Unit\s+Balance/i.test(line)
    if (!openingMatch && !transaction && !closing) {
      region.push(line)
      return
    }
    // The fund's own lines have begun: read its header from what came before.
    if (!header && region.length > 0) startFund(openingMatch ? [...region, line.slice(0, openingMatch.index)] : region)
    region = []
    if (openingMatch) opening = num(openingMatch[1])
    if (transaction) {
      flows.push(transaction.flow)
      unitsBought += transaction.units
      return
    }
    if (!closing) return
    // The closing figures sometimes wrap onto the next line or two.
    // Stop at the next fund so its figures are never mixed in.
    const block = [line]
    for (const next of lines.slice(i + 1, i + 3)) {
      if (/ISIN|Closing\s+Unit|Opening\s+Unit|Folio\s+No/i.test(next) || isSchemeLine(next)) break
      block.push(next)
    }
    const fundHeader: { name: string; isin: string | null } | null = header
    header = null
    const text = block.join(' ')
    const units = num(/Closing\s+Unit\s+Balance\s*:?\s*([\d,]+(?:\.\d+)?)/i.exec(text)?.[1] ?? '0')
    const nav = new RegExp(String.raw`NAV\s+on\s+${DATE}\s*:?\s*${AMOUNT}`, 'i').exec(text)
    const market = new RegExp(String.raw`(?:Market\s+Value|Valuation)\s+on\s+${DATE}\s*:?\s*${AMOUNT}`, 'i').exec(text)
    const cost = new RegExp(String.raw`Cost\s+Value\s*:?\s*${AMOUNT}`, 'i').exec(text)
    const value = round(market ? num(market[2]) : nav ? units * num(nav[2]) : 0, 2)
    if (!fundHeader || !(units > 0) || !(value > 0)) return // fully redeemed folios show a zero balance
    const { name, isin } = fundHeader
    const fund: CasFund = {
      name,
      isin,
      units,
      navDate: toIso(market?.[1] ?? nav?.[1] ?? '') ?? null,
      cost: cost ? num(cost[1]) : null,
      value,
      flows: opening === 0 && flows.length > 0 && Math.abs(unitsBought - units) < 0.01 ? flows : null,
    }
    addFund(funds, fund)
  })
  return [...funds.values()]
}

/** Reads a CAS statement: the detailed one from CAMS or KFintech, or the depository one from NSDL or CDSL. */
export function parseCasText(lines: string[]): CasFund[] {
  const funds = parseCamsText(lines)
  return funds.length > 0 ? funds : parseDepositoryCasText(lines)
}

/** Adds a fund, merging it with the same scheme already found in another folio. */
function addFund(funds: Map<string, CasFund>, fund: CasFund) {
  const key = fund.isin ?? fund.name.toLowerCase()
  const prev = funds.get(key)
  funds.set(
    key,
    prev
      ? {
          ...prev,
          units: round(prev.units + fund.units, 4),
          value: round(prev.value + fund.value, 2),
          cost: prev.cost !== null && fund.cost !== null ? round(prev.cost + fund.cost, 2) : null,
          navDate: [prev.navDate, fund.navDate].filter(Boolean).sort().at(-1) ?? null,
          flows: mergeFlows(prev.flows, fund.flows),
        }
      : fund,
  )
}

/**
 * Reads the depository CAS that NSDL or CDSL send instead when you also have a demat account. Mutual
 * funds held with the registrar sit in a table under "MUTUAL FUND UNITS HELD AS ON dd-mm-yyyy", one row
 * per folio: name fragments, ISIN, folio, ARN code, units, NAV, invested amount, market value, then
 * expense ratios, commission and profit. Names are cut into fragments in that table, so they come from the
 * statement's "Scheme Name :" lines and "CODE - Fund name" transaction headings instead, matched by ISIN.
 * This statement lists only the period's transactions, so no fund gets a full purchase history.
 */
export function parseDepositoryCasText(lines: string[]): CasFund[] {
  const ISIN_LABEL = /ISIN\s*:\s*(INF[0-9A-Z]{8}\d)/i
  const names = new Map<string, string>()
  lines.forEach((line, i) => {
    // "MTDG - Axis Multicap Fund Direct Growth" directly above "ISIN : INF…": the cleanest full name.
    const isin = ISIN_LABEL.exec(line)?.[1].toUpperCase()
    const heading = /^\s*[A-Z0-9]{2,12}\s+-\s+(.+?)\s*$/i.exec(lines[i - 1] ?? '')
    if (isin && heading && !/:/.test(heading[1])) names.set(isin, heading[1])
  })
  lines.forEach((line, i) => {
    // "Scheme Name : … Scheme Code : …", whose ISIN follows a few lines later after the folio line.
    const scheme = /Scheme\s+Name\s*:\s*(.+?)(?:\s+Scheme\s+Code\s*:.*)?$/i.exec(line)
    if (!scheme) return
    let name = scheme[1].trim()
    const after = lines.slice(i + 1, i + 9)
    if (name.endsWith('-')) {
      const rest = after.slice(0, 3).find((l) => !/:/.test(l) && !/INF[0-9A-Z]{9}/.test(l))
      if (rest) name = `${name} ${rest.trim()}`
    }
    const next = after.findIndex((l) => /Scheme\s+Name\s*:/i.test(l))
    const isin = (next < 0 ? after : after.slice(0, next)).map((l) => ISIN_LABEL.exec(l)?.[1].toUpperCase()).find(Boolean)
    if (isin && !names.has(isin)) names.set(isin, name)
  })

  const held = lines.findIndex((line) => /UNITS\s+HELD\s+AS\s+ON/i.test(line))
  if (held < 0) return []
  const asOfText = /AS\s+ON\s+(\d{1,2}-(?:\d{2}|[A-Za-z]{3})-\d{4})/i.exec(lines[held])?.[1] ?? ''
  const navDate = /^\d{1,2}-\d{2}-\d{4}$/.test(asOfText)
    ? `${asOfText.slice(-4)}-${asOfText.split('-')[1]}-${asOfText.split('-')[0].padStart(2, '0')}`
    : toIso(asOfText)
  const funds = new Map<string, CasFund>()
  lines.slice(held + 1).forEach((line, i, rest) => {
    const found = /\bINF[0-9A-Z]{8}\d\b/.exec(line)
    if (!found) return
    const figures = line
      .slice(found.index + 12)
      .split(/\s+/)
      .filter((t) => /^-?[\d,]+\.\d+$/.test(t))
      .map((t) => Number(t.replace(/,/g, '')))
    const [units, nav] = figures
    if (figures.length < 3 || !(units > 0) || !(nav > 0)) return
    // The market value is the figure that equals units × NAV: right after the NAV, or after the invested amount.
    const closes = (value: number) => Math.abs(units * nav - value) <= Math.max(1, value * 0.005)
    const at = [3, 2].find((j) => figures[j] > 0 && closes(figures[j]))
    if (at === undefined) return // not a holdings row Stash can be sure of
    const isin = found[0]
    const fragment = cleanName(`${line.slice(0, found.index)} ${/:|INF[0-9A-Z]{9}|\d/.test(rest[i + 1] ?? ':') ? '' : rest[i + 1]}`)
    addFund(funds, {
      name: names.get(isin) ?? (fragment || isin),
      isin,
      units,
      navDate,
      cost: at === 3 ? figures[2] : null,
      value: figures[at],
      flows: null,
    })
  })
  return [...funds.values()]
}

/**
 * A privacy-safe outline of a statement Stash couldn't read, for reporting the problem: only the lines
 * from the first folio onwards that look like fund names, headers, balances or transactions, with every
 * digit replaced by 0 and PANs, emails and nominee names removed. Other lines, such as a holder's name,
 * become "[other line]"; the investor's name and address come before the first folio and are left out.
 */
export function casOutline(lines: string[]): string {
  const mask = (line: string) =>
    line
      .replace(/[A-Z]{5}\d{4}[A-Z]/g, 'XXXXX0000X')
      .replace(/\S+@\S+/g, '[email]')
      .replace(/(Nominee\s*\d\s*:)[^:]*?(?=Nominee\s*\d|$)/gi, '$1 [name] ')
      .replace(/\d/g, '0')
  const first = lines.findIndex((line) => /Folio\s+No/i.test(line))
  if (first < 0) {
    // Nothing recognisable: show only the shape of the first lines, letters and digits blanked.
    return [`${lines.length} lines, no "Folio No" line. First lines, letters as x and digits as 0:`, ...lines.slice(0, 25).map((line) => line.replace(/[A-Za-z]/g, 'x').replace(/\d/g, '0'))].join('\n')
  }
  const relevant = /Folio\s+No|ISIN|Registrar|Advisor|Unit\s+Balance|NAV\s+on|Cost\s+Value|Market\s+Value|Valuation|^\s*\d{1,2}-[A-Za-z]{3}-\d{4}/i
  // Fund names carry words like these; a holder's name or address doesn't, so other lines become a placeholder.
  const fundWords = /fund|growth|plan|direct|regular|idcw|dividend|option|scheme|etf|fof|index|nifty|sensex/i
  const kept: string[] = []
  for (const line of lines.slice(first)) {
    // Hindi text and anything that reads like an address or "D/O name" line stays hidden, even with a fund word in it.
    const personal = /[\u0900-\u097F]|\b[DSWC]\s*\/?\s*O\b|\b(?:apartments?|road|street|nagar|flat|floor|society|lane|colony|tower|near|opp)\b/i
    if (!personal.test(line) && (relevant.test(line) || isSchemeLine(line) || fundWords.test(line))) kept.push(mask(line))
    else if (kept.at(-1) !== '[other line]') kept.push('[other line]')
  }
  return [`${lines.length} lines; from the first folio on, digits as 0 and other lines hidden:`, ...kept.slice(0, 150)].join('\n')
}

/** Flows of two folios or funds combined into one holding; unknown if either is unknown. */
const mergeFlows = (a: Flow[] | null, b: Flow[] | null) => (a && b ? [...a, ...b].sort((x, y) => x.date.localeCompare(y.date)) : null)

const tokens = (name: string) =>
  new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t && !['fund', 'plan', 'option', 'scheme', 'the', 'of', 'and'].includes(t)),
  )

/** The existing holding a statement fund most likely is: same ISIN, else a close name match. */
export function matchHolding(fund: CasFund, holdings: Holding[]): Holding | null {
  if (fund.isin) {
    const byIsin = holdings.find((h) => h.isin === fund.isin)
    if (byIsin) return byIsin
  }
  // Direct and Regular plans of a fund are different schemes with different NAVs.
  const plan = (name: string) => (/\bdirect\b/i.test(name) ? 'direct' : /\bregular\b/i.test(name) ? 'regular' : null)
  const fundPlan = plan(fund.name)
  const a = tokens(fund.name)
  let best: Holding | null = null
  let bestScore = 0
  for (const h of holdings) {
    if (h.isin && fund.isin && h.isin !== fund.isin) continue
    const holdingPlan = plan(h.name)
    if (fundPlan && holdingPlan && fundPlan !== holdingPlan) continue
    const b = tokens(h.name)
    const shared = [...a].filter((t) => b.has(t)).length
    const score = shared / new Set([...a, ...b]).size
    if (score > bestScore) [best, bestScore] = [h, score]
  }
  return bestScore >= 0.5 ? best : null
}

/** A sensible starting asset class for a new fund, which the user can change before importing. */
export function guessAssetClass(name: string): Holding['assetClass'] {
  const n = name.toLowerCase()
  if (/gold|silver/.test(n)) return 'gold'
  if (/liquid|overnight|money market/.test(n)) return 'cash'
  if (/arbitrage/.test(n)) return 'debt' // behaves like debt, even though it's taxed as equity
  if (/equity|index|nifty|sensex|cap\b|flexi|elss|tax saver/.test(n)) return 'equity'
  if (/debt|bond|gilt|duration|income|corporate|banking & psu|banking and psu|credit|floater|treasury|savings fund|target maturity|psu/.test(n))
    return 'debt'
  return 'equity'
}

export type CasAction = { kind: 'update'; holdingId: string } | { kind: 'add'; assetClass: Holding['assetClass'] } | { kind: 'skip' }

/**
 * Applies the statement: updated holdings take the statement's cost, value and date; new ones are added.
 * SIPs restart from the statement date, so instalments Stash added after it are re-added on top of the
 * statement's value instead of being lost or counted twice. A statement covering a fund's whole history
 * replaces its cash flows, so its yearly return is known straight away. Holdings in `remove` (funds from an
 * earlier statement that aren't in this one) are deleted.
 */
export function applyCasImport(data: AppData, choices: { fund: CasFund; action: CasAction }[], today: string, remove: string[] = []): AppData {
  const updates = new Map<string, CasFund>()
  const added: Holding[] = []
  for (const { fund, action } of choices) {
    if (action.kind === 'update') {
      const prev = updates.get(action.holdingId)
      updates.set(
        action.holdingId,
        prev
          ? {
              ...prev,
              value: prev.value + fund.value,
              cost: prev.cost !== null && fund.cost !== null ? prev.cost + fund.cost : null,
              flows: mergeFlows(prev.flows, fund.flows),
            }
          : fund,
      )
    } else if (action.kind === 'add') {
      added.push({
        id: newId(),
        name: fund.name,
        assetClass: action.assetClass,
        invested: fund.cost ?? fund.value,
        currentValue: fund.value,
        valueUpdated: fund.navDate ?? today,
        ...(fund.isin ? { isin: fund.isin } : {}),
        flows: fund.flows ?? [{ date: fund.navDate ?? today, amount: fund.value }],
      })
    }
  }
  const holdings = data.holdings.filter((h) => !remove.includes(h.id)).map((h) => {
    const fund = updates.get(h.id)
    if (!fund) return h
    const asOf = fund.navDate ?? today
    const earlier = (h.flows ?? []).filter((f) => f.date <= asOf)
    return {
      ...h,
      invested: fund.cost ?? h.invested,
      currentValue: fund.value,
      valueUpdated: asOf,
      ...(fund.isin ? { isin: fund.isin } : {}),
      ...(h.sip ? { sip: { ...h.sip, lastApplied: sipCoveredMonth(asOf, h.sip.day) } } : {}),
      // The statement's own history when it has one; otherwise Stash's, up to the statement date (later
      // SIP instalments are re-added below, like the invested amount). When Stash only started tracking the
      // holding after the statement date, returns are measured from the statement's value instead.
      flows: fund.flows ?? (earlier.length > 0 ? earlier : [{ date: asOf, amount: fund.value }]),
    }
  })
  return applySips({ ...data, holdings: [...holdings, ...added] }, today)
}
